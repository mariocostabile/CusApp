import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Modal,
  Alert,
  Platform,
  RefreshControl,
  LogBox,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GinnipalScraper, GinnipalScraperRef, DashboardData } from '../components/GinnipalScraper';
import { fetchLiveGoogleCrowd, BASELINE_WEEKLY, getCrowdComparisonLabel } from '../services/googleCrowdService';
import {
  fetchLiveGinnipalData,
  bookLiveReservation,
  cancelLiveReservation,
} from '../services/ginnipalService';
import {
  saveUserSession,
  getUserSession,
  saveCachedDashboard,
  clearUserSession,
} from '../services/storageService';

LogBox.ignoreLogs([
  'Cannot connect to Expo CLI',
  '[GinnipalService]',
]);

// Initial state for CUS dashboard (empty until authenticated)
const initialData: DashboardData = {
  name: '',
  tessera: '',
  email: '',
  academicYear: '2026/2027',
  medicalCertExpiry: '',
  medicalCertFitness: 'In regola',
  subscription: {
    title: 'Body Building',
    code: 'BB',
    total: 0,
    used: 0,
    remaining: 0,
    validity: '',
  },
  reservations: [],
};

export interface BookingSlotOption {
  slot: string;
  category: 'mattina' | 'pomeriggio' | 'sera';
  periodLabel: string;
  crowdLevel?: string;
  crowdColor?: string;
}

const WEEKDAY_BOOKING_SLOTS: BookingSlotOption[] = [
  // Mattina
  { slot: '10:00 - 12:00', category: 'mattina', periodLabel: '1° Turno', crowdLevel: 'Calmo (~20%)', crowdColor: '#10B981' },
  { slot: '12:00 - 14:00', category: 'mattina', periodLabel: '2° Turno', crowdLevel: 'Molto Calmo (~18%)', crowdColor: '#10B981' },
  // Pomeriggio
  { slot: '14:00 - 16:00', category: 'pomeriggio', periodLabel: '3° Turno', crowdLevel: 'Calmo (~25%)', crowdColor: '#10B981' },
  { slot: '16:00 - 18:00', category: 'pomeriggio', periodLabel: '4° Turno', crowdLevel: 'Moderato (~45%)', crowdColor: '#F59E0B' },
  // Sera
  { slot: '18:00 - 20:00', category: 'sera', periodLabel: '5° Turno', crowdLevel: 'Alta Richiesta (~80%)', crowdColor: '#EF4444' },
  { slot: '20:00 - 22:00', category: 'sera', periodLabel: '6° Turno', crowdLevel: 'In Calo (~60%)', crowdColor: '#F59E0B' },
];

const SATURDAY_BOOKING_SLOTS: BookingSlotOption[] = [
  { slot: '10:00 - 12:00', category: 'mattina', periodLabel: '1° Turno Mattina' },
  { slot: '12:00 - 14:00', category: 'mattina', periodLabel: '2° Turno Mattina' },
];

const TIME_SLOTS = WEEKDAY_BOOKING_SLOTS;

export interface CrowdHourItem {
  hour: number;
  label: string;
  percent: number;
  typical: number;
  level: string;
  color: string;
  comparisonStatus?: string;
  isLive?: boolean;
  description?: string;
}

export interface CrowdDayData {
  name: string;
  short: string;
  isClosed: boolean;
  shiftsNotice?: string;
  hours: CrowdHourItem[];
}

const WEEKLY_CROWD_DATA: Record<string, CrowdDayData> = BASELINE_WEEKLY;

export interface BookingDayOption {
  dayName: string;
  dayNum: string;
  monthName: string;
  tag?: string;
  date: string;
  isSaturday?: boolean;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MONTH_NAMES = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

function getDynamicBookingDays(): BookingDayOption[] {
  const days: BookingDayOption[] = [];
  const now = new Date();
  const currentDayOfWeek = now.getDay(); // 0 is Sunday, 6 is Saturday

  // Regola Portale CUS GinniPAL:
  // - Sabato: si può prenotare ESCLUSIVAMENTE per la giornata di Sabato (10:00 - 14:00).
  //   La domenica la palestra è chiusa e il lunedì della settimana successiva
  //   NON è prenotabile durante la giornata di sabato.
  // - Domenica: la palestra è chiusa oggi; è possibile prenotare solo per Lunedì (Domani).
  // - Dal Lunedì al Venerdì: è possibile prenotare per Oggi e Domani (il venerdì include il sabato).

  if (currentDayOfWeek === 6) {
    const dayNum = String(now.getDate()).padStart(2, '0');
    const monthNum = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${dayNum}/${monthNum}/${year}`;

    days.push({
      dayName: 'Sab',
      dayNum,
      monthName: MONTH_NAMES[now.getMonth()],
      tag: 'Oggi',
      date: dateStr,
      isSaturday: true,
    });
    return days;
  }

  if (currentDayOfWeek === 0) {
    const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dayNum = String(d.getDate()).padStart(2, '0');
    const monthNum = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const dateStr = `${dayNum}/${monthNum}/${year}`;

    days.push({
      dayName: 'Lun',
      dayNum,
      monthName: MONTH_NAMES[d.getMonth()],
      tag: 'Domani',
      date: dateStr,
      isSaturday: false,
    });
    return days;
  }

  // Da Lunedì a Venerdì: Oggi e Domani (il venerdì include Sabato)
  let daysAdded = 0;
  let offset = 0;

  while (daysAdded < 2 && offset < 3) {
    const d = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const dayOfWeek = d.getDay();

    if (dayOfWeek !== 0) {
      const dayNum = String(d.getDate()).padStart(2, '0');
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const dateStr = `${dayNum}/${monthNum}/${year}`;

      let tag: string | undefined = undefined;
      if (offset === 0) tag = 'Oggi';
      else if (offset === 1) tag = 'Domani';

      days.push({
        dayName: DAY_NAMES[dayOfWeek],
        dayNum,
        monthName: MONTH_NAMES[d.getMonth()],
        tag,
        date: dateStr,
        isSaturday: dayOfWeek === 6,
      });
      daysAdded++;
    }
    offset++;
  }
  return days;
}

// Helper to determine if a slot is bookable
// Rule: On "Oggi", only slots whose start hour is strictly AFTER currentHour can be booked
// (e.g. at 16:xx, slots starting at 10, 12, 14, 16 are passed/in-progress; only 18-20 and 20-22 are available)
// On other days (e.g. Domani), all slots are available.
const isSlotBookable = (slotStr: string, isToday: boolean, currentHour: number): boolean => {
  if (!isToday) {
    return true;
  }
  const startHourStr = slotStr.split(' - ')[0]?.split(':')[0];
  const startHour = parseInt(startHourStr || '0', 10);
  return currentHour < startHour;
};

const getFirstAvailableSlot = (isSaturday: boolean, isToday: boolean, currentHour: number): string => {
  const slots = isSaturday ? SATURDAY_BOOKING_SLOTS : WEEKDAY_BOOKING_SLOTS;
  const avail = slots.find((s) => isSlotBookable(s.slot, isToday, currentHour));
  return avail ? avail.slot : (slots[0]?.slot || '18:00 - 20:00');
};

// Helper to calculate cancellation window: strictly 1 hour before session start!
const getCancelInfo = (res: { date: string; time: string }, now: number) => {
  let deadline = 0;
  let deadlineStr = '17:00';

  try {
    const parts = res.date.split('/');
    const startTimeStr = res.time.split(' - ')[0].trim();
    const timeParts = startTimeStr.split(':');

    if (parts.length === 3 && timeParts.length >= 2) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      const h = parseInt(timeParts[0], 10);
      const min = parseInt(timeParts[1], 10);

      // Session start timestamp
      const sessionStart = new Date(y, m, d, h, min).getTime();

      // Rule: deadline is strictly 1 HOUR BEFORE the session start!
      // (Es. per turno delle 18:00, scade alle 17:00)
      deadline = sessionStart - 60 * 60 * 1000;

      const deadDate = new Date(deadline);
      const deadH = String(deadDate.getHours()).padStart(2, '0');
      const deadM = String(deadDate.getMinutes()).padStart(2, '0');
      deadlineStr = `${deadH}:${deadM}`;
    }
  } catch {
    deadline = 0;
  }

  const diffMs = deadline - now;
  const canCancel = diffMs > 0;

  let timeFormatted = '';
  if (canCancel) {
    const totalSecs = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;

    const padM = String(minutes).padStart(2, '0');
    const padS = String(seconds).padStart(2, '0');

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      timeFormatted = `${days}g ${remHours}h ${padM}m`;
    } else if (hours > 0) {
      timeFormatted = `${hours}h ${padM}m ${padS}s`;
    } else {
      timeFormatted = `${padM}m ${padS}s`;
    }
  }

  return { canCancel, timeFormatted, deadlineStr, diffMs };
};

const getSlotDeadlineText = (slotStr: string, dateStr: string) => {
  try {
    const startTimeStr = slotStr.split(' - ')[0] || '10:00';
    const hourNum = parseInt(startTimeStr.split(':')[0], 10);
    const minNum = startTimeStr.split(':')[1] || '00';
    const deadlineHour = hourNum - 1;
    const deadlineStr = `${String(deadlineHour).padStart(2, '0')}:${minNum}`;
    return `fino alle ore ${deadlineStr} del ${dateStr}`;
  } catch {
    return 'fino a 1 ora prima del turno';
  }
};

/**
 * Checks if a reservation's shift is still active / in progress.
 * Once the shift end time has passed (e.g. after 14:00 for a 12:00 - 14:00 slot),
 * the reservation is expired and automatically removed from the active reservations board.
 */
export const isReservationActive = (res: { date: string; time: string }, now: number): boolean => {
  try {
    const parts = res.date.split('/');
    if (parts.length !== 3) return true;

    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);

    const timeRangeParts = res.time.split(' - ');
    const endTimeStr = (timeRangeParts[1] || '').trim();

    if (endTimeStr) {
      const endParts = endTimeStr.split(':');
      if (endParts.length >= 2) {
        const endH = parseInt(endParts[0], 10);
        const endM = parseInt(endParts[1], 10);
        const sessionEnd = new Date(y, m, d, endH, endM, 0, 0).getTime();
        return now < sessionEnd;
      }
    } else {
      const startParts = (timeRangeParts[0] || '').trim().split(':');
      if (startParts.length >= 2) {
        const startH = parseInt(startParts[0], 10);
        const startM = parseInt(startParts[1], 10);
        const sessionEnd = new Date(y, m, d, startH + 2, startM, 0, 0).getTime();
        return now < sessionEnd;
      }
    }
  } catch {
    return true;
  }
  return true;
};

/**
 * Formats full name from Italian administrative format "COGNOME NOME" to "NOME COGNOME"
 * e.g. "COSTABILE MARIO" -> "MARIO COSTABILE"
 */
function formatFirstAndLastName(fullName: string): string {
  if (!fullName || fullName === 'Tesserato CUS') return fullName;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`;
  }
  return fullName;
}

export default function App() {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0);

  const scraperRef = useRef<GinnipalScraperRef>(null);

  const AVAILABLE_DAYS = getDynamicBookingDays();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [dashboardData, setDashboardData] = useState<DashboardData>(initialData);
  const [isBookingModalVisible, setIsBookingModalVisible] = useState(false);
  const [selectedDay, setSelectedDay] = useState(AVAILABLE_DAYS[0]?.date || '03/10/2026');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [cancellingResId, setCancellingResId] = useState<string | null>(null);
  const [confirmCancelModalData, setConfirmCancelModalData] = useState<{
    id: string;
    date: string;
    time: string;
    title: string;
  } | null>(null);

  // Live timer tick every second for real-time countdown
  const [nowTime, setNowTime] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter reservations whose shift end time has not passed yet.
  // Updates automatically in real-time as soon as the shift end time arrives.
  const activeReservations = useMemo(() => {
    return (dashboardData.reservations || []).filter((res) => isReservationActive(res, nowTime));
  }, [dashboardData.reservations, nowTime]);

  const now = new Date(nowTime);
  const currentHour = now.getHours();
  const currentDayOfWeek = now.getDay(); // 0 = dom, 1 = lun, 2 = mar, 3 = mer, 4 = gio, 5 = ven, 6 = sab
  const CROWD_DAY_MAP = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  const todayCrowdKey = CROWD_DAY_MAP[currentDayOfWeek];
  const initialCrowdDay = todayCrowdKey;

  const [selectedCrowdDay, setSelectedCrowdDay] = useState(initialCrowdDay);
  const nowInit = new Date();
  const [lastCrowdRefresh, setLastCrowdRefresh] = useState(
    `${String(nowInit.getHours()).padStart(2, '0')}:${String(nowInit.getMinutes()).padStart(2, '0')}`
  );
  const [crowdWeeklyData, setCrowdWeeklyData] = useState<Record<string, CrowdDayData>>(WEEKLY_CROWD_DATA);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const crowdTabsRef = useRef<ScrollView>(null);
  const loginScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (currentDayOfWeek === 0 || currentDayOfWeek === 6 || currentDayOfWeek === 5) {
      const timer = setTimeout(() => {
        crowdTabsRef.current?.scrollToEnd({ animated: true });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [currentDayOfWeek]);

  // Restore saved session from local storage on startup & background sync
  useEffect(() => {
    let isMounted = true;

    async function restoreSessionAndSync() {
      try {
        const session = await getUserSession();
        if (session && session.email && session.password) {
          if (isMounted) {
            setEmail(session.email);
            setPassword(session.password);
            setIsAuthenticated(true);
            if (session.dashboardData && session.dashboardData.name) {
              setDashboardData(session.dashboardData);
            }
          }

          // Background live sync to keep data fresh and update cache
          fetchLiveGinnipalData(session.email, session.password)
            .then((liveGinnipal) => {
              if (isMounted && liveGinnipal && liveGinnipal.name) {
                setDashboardData(liveGinnipal);
                saveCachedDashboard(liveGinnipal);
              }
            })
            .catch((err) => {
              console.warn('[App] Background live sync notice:', err);
            });
        }
      } catch (err) {
        console.warn('[App] Error restoring session from storage:', err);
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    }

    restoreSessionAndSync();

    fetchLiveGoogleCrowd().then((liveCrowd) => {
      if (isMounted && liveCrowd && liveCrowd.weeklyData) {
        setCrowdWeeklyData(liveCrowd.weeklyData);
        if (liveCrowd.timestamp) {
          setLastCrowdRefresh(liveCrowd.timestamp);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleFullRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [liveGinnipal, snap] = await Promise.all([
        fetchLiveGinnipalData(email, password),
        fetchLiveGoogleCrowd(),
      ]);
      if (liveGinnipal && liveGinnipal.name) {
        setDashboardData(liveGinnipal);
      }
      if (snap && snap.weeklyData) {
        setCrowdWeeklyData(snap.weeklyData);
        if (snap.timestamp) {
          setLastCrowdRefresh(snap.timestamp);
        }
      }
    } catch {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      setLastCrowdRefresh(`${h}:${m}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const isGymOpenNow =
    currentDayOfWeek === 0
      ? false
      : currentDayOfWeek === 6
      ? currentHour >= 10 && currentHour < 14
      : currentHour >= 10 && currentHour < 22;

  const isTodaySelected = selectedCrowdDay === todayCrowdKey;

  const activeDayData =
    crowdWeeklyData[selectedCrowdDay] || crowdWeeklyData[todayCrowdKey] || crowdWeeklyData['mercoledi'];
  const activeCrowdList = activeDayData.hours || [];
  const liveCrowdItem =
    activeCrowdList.find((h) => h.hour === currentHour) ||
    activeCrowdList.find((h) => Math.abs(h.hour - currentHour) <= 1) ||
    activeCrowdList[0];

  const selectedDayObj =
    AVAILABLE_DAYS.find((d) => d.date === selectedDay) || AVAILABLE_DAYS[0] || {
      dayName: 'Sab',
      dayNum: '03',
      monthName: 'Ott',
      tag: 'Oggi',
      date: '03/10/2026',
      isSaturday: true,
    };
  const isSelectedSaturday = !!selectedDayObj.isSaturday;
  const isSelectedToday = selectedDayObj?.tag === 'Oggi';

  const isSlotAlreadyBookedByUser = (slot: string, date: string) => {
    return (dashboardData.reservations || []).some((r) => {
      if (r.date !== date) return false;
      const rTimeClean = (r.time || '').trim();
      const slotClean = slot.trim();
      return rTimeClean === slotClean || rTimeClean.startsWith(slotClean.split(' - ')[0]);
    });
  };

  const isSelectedSlotBookable = selectedSlot
    ? isSlotBookable(selectedSlot, isSelectedToday, currentHour) &&
      !isSlotAlreadyBookedByUser(selectedSlot, selectedDay)
    : false;

  const availableSlotsForSelectedDay = isSelectedSaturday ? SATURDAY_BOOKING_SLOTS : WEEKDAY_BOOKING_SLOTS;
  const hasAnyBookableSlot = availableSlotsForSelectedDay.some(
    (s) =>
      isSlotBookable(s.slot, isSelectedToday, currentHour) &&
      !isSlotAlreadyBookedByUser(s.slot, selectedDay)
  );

  const getSlotDynamicCrowd = (slot: string, dateStr: string) => {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      const dayMap = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
      const dayKey = dayMap[d.getDay()];
      const dayData = crowdWeeklyData[dayKey];
      if (dayData && dayData.hours) {
        const startHour = parseInt(slot.split(':')[0], 10);
        const hoursInSlot = dayData.hours.filter((h) => h.hour >= startHour && h.hour < startHour + 2);
        if (hoursInSlot.length > 0) {
          const avgPercent = Math.round(
            hoursInSlot.reduce((sum, h) => sum + (h.percent || 0), 0) / hoursInSlot.length
          );
          if (avgPercent >= 70) {
            return {
              label: `Alta (~${avgPercent}%)`,
              shortLabel: `Alta (~${avgPercent}%)`,
              badgeText: 'Affollato',
              dotColor: '#DC2626',
              bgColor: '#FEE2E2',
              textColor: '#991B1B',
            };
          } else if (avgPercent >= 40) {
            return {
              label: `Media (~${avgPercent}%)`,
              shortLabel: `Media (~${avgPercent}%)`,
              badgeText: 'Moderato',
              dotColor: '#D97706',
              bgColor: '#FEF3C7',
              textColor: '#92400E',
            };
          } else {
            return {
              label: `Calma (~${avgPercent}%)`,
              shortLabel: `Calma (~${avgPercent}%)`,
              badgeText: 'Calmo',
              dotColor: '#16A34A',
              bgColor: '#DCFCE7',
              textColor: '#166534',
            };
          }
        }
      }
    }
    return {
      label: 'Calma',
      shortLabel: 'Calma',
      badgeText: 'Calmo',
      dotColor: '#16A34A',
      bgColor: '#DCFCE7',
      textColor: '#166534',
    };
  };

  const handleSelectBookingDay = (dayDate: string) => {
    setSelectedDay(dayDate);
    const dayObj = AVAILABLE_DAYS.find((d) => d.date === dayDate);
    const isToday = dayObj?.tag === 'Oggi';
    const isSat = !!dayObj?.isSaturday;
    const availableSlots = isSat ? SATURDAY_BOOKING_SLOTS : WEEKDAY_BOOKING_SLOTS;

    const firstAvail = availableSlots.find(
      (s) =>
        isSlotBookable(s.slot, isToday, currentHour) &&
        !isSlotAlreadyBookedByUser(s.slot, dayDate)
    );
    setSelectedSlot(firstAvail ? firstAvail.slot : '');
  };

  const handleOpenBookingModal = () => {
    const firstDay = AVAILABLE_DAYS[0];
    if (firstDay) {
      setSelectedDay(firstDay.date);
      const isToday = firstDay.tag === 'Oggi';
      const isSat = !!firstDay.isSaturday;
      const availableSlots = isSat ? SATURDAY_BOOKING_SLOTS : WEEKDAY_BOOKING_SLOTS;
      const firstAvail = availableSlots.find(
        (s) =>
          isSlotBookable(s.slot, isToday, currentHour) &&
          !isSlotAlreadyBookedByUser(s.slot, firstDay.date)
      );
      setSelectedSlot(firstAvail ? firstAvail.slot : '');
    }
    setIsBookingModalVisible(true);
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError('Inserisci sia email che password');
      return;
    }
    setEmail(cleanEmail);
    setPassword(cleanPassword);
    setIsLoading(true);
    setError('');

    try {
      const [liveData, liveCrowd] = await Promise.all([
        fetchLiveGinnipalData(cleanEmail, cleanPassword),
        fetchLiveGoogleCrowd(),
      ]);

      if (!liveData || !liveData.name) {
        throw new Error('Credenziali non corrette o profilo non trovato');
      }

      setDashboardData(liveData);
      if (liveCrowd && liveCrowd.weeklyData) {
        setCrowdWeeklyData(liveCrowd.weeklyData);
        if (liveCrowd.timestamp) {
          setLastCrowdRefresh(liveCrowd.timestamp);
        }
      }
      setIsAuthenticated(true);
      await saveUserSession(cleanEmail, cleanPassword, liveData);
    } catch (e: any) {
      setError(e.message || 'Credenziali non valide o errore di connessione');
    } finally {
      setIsLoading(false);
    }
  };

  const handleScraperLoginSuccess = () => {
    setIsLoading(false);
    setIsAuthenticated(true);
    scraperRef.current?.fetchDashboard();
  };

  const handleScraperDashboardData = (data: DashboardData) => {
    if (data && data.name) {
      setDashboardData(data);
      saveCachedDashboard(data);
    }
  };


  const handleConfirmBooking = async () => {
    if (!hasAnyBookableSlot || !isSelectedSlotBookable) {
      Alert.alert('Turno non disponibile', 'Seleziona una fascia oraria disponibile per procedere.');
      return;
    }
    setIsSubmittingBooking(true);

    try {
      const updatedData = await bookLiveReservation(email, password, selectedDay, selectedSlot);
      if (updatedData && updatedData.name) {
        setDashboardData(updatedData);
        saveCachedDashboard(updatedData);
      }
      setIsBookingModalVisible(false);
    } catch (err: any) {
      Alert.alert('Errore Prenotazione', err.message || 'Si è verificato un errore durante la prenotazione.');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handlePromptCancel = (res: { id: string; date: string; time: string; title: string }) => {
    setConfirmCancelModalData(res);
  };

  const executeCancelReservation = async (resId: string) => {
    setCancellingResId(resId);
    try {
      const updatedData = await cancelLiveReservation(email, password, resId);
      setDashboardData(updatedData);
      saveCachedDashboard(updatedData);
    } catch (err: any) {
      Alert.alert('Errore Annullamento', err.message || 'Impossibile annullare la prenotazione.');
    } finally {
      setCancellingResId(null);
    }
  };

  const handleLogout = () => {
    Alert.alert('Disconnetti Profilo', 'Vuoi uscire dal tuo account CusApp?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Disconnetti',
        style: 'destructive',
        onPress: async () => {
          await clearUserSession();
          setIsAuthenticated(false);
          setEmail('');
          setPassword('');
          setDashboardData(initialData);
        },
      },
    ]);
  };

  // Session restoring spinner
  if (isRestoringSession) {
    return (
      <View style={[styles.loginSafeArea, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#0083C4' }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0083C4" translucent={true} />
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // If not logged in
  if (!isAuthenticated) {
    return (
      <View style={[styles.loginSafeArea, { paddingTop: topInset }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#F0F6FA" translucent={true} />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={loginScrollRef}
            contentContainerStyle={styles.loginScrollContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={true}
          >
            <View style={styles.loginInner}>
              <View style={styles.brandBox}>
                <Text style={styles.brandTitle}>CusApp</Text>
                <Text style={styles.brandSubtitle}>CUS Cosenza • Portale Tesserati</Text>
              </View>

              <View style={styles.loginCard}>
                <Text style={styles.formTitle}>Accedi al tuo profilo</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="nome@email.it"
                    placeholderTextColor="#94A3B8"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    importantForAutofill="yes"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="••••••••••••"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="current-password"
                    textContentType="password"
                    importantForAutofill="yes"
                    onFocus={() => {
                      setTimeout(() => {
                        loginScrollRef.current?.scrollToEnd({ animated: true });
                      }, 180);
                    }}
                  />
                </View>

                {error ? <Text style={styles.loginError}>{error}</Text> : null}

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleLogin}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>ACCEDI</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.footerCopy}>CusApp • CUS Cosenza</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <GinnipalScraper
          ref={scraperRef}
          onLoginSuccess={handleScraperLoginSuccess}
          onLoginError={(err) => {
            setIsLoading(false);
            setError(err);
          }}
          onDashboardData={handleScraperDashboardData}
          onBookingSuccess={() => {}}
          onBookingError={(err) => Alert.alert('Errore Prenotazione', err)}
          onCancelSuccess={() => {}}
          onCancelError={(err) => Alert.alert('Errore Annullamento', err)}
        />
      </View>
    );
  }

  // Dashboard View
  const usagePercentage = Math.round(
    (dashboardData.subscription.used / dashboardData.subscription.total) * 100
  );

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0284C7" translucent={true} />


      {/* Top Header Bar */}
      <View style={[styles.topBar, { paddingTop: topInset + 10 }]}>
        <View style={styles.topBarLeft}>
          <Text style={styles.topBarBrand}>CusApp</Text>
        </View>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Text style={styles.logoutBtnText}>Esci</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.contentScrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleFullRefresh}
            colors={['#0284C7']}
            tintColor="#0284C7"
          />
        }
      >
        {/* User Welcome Card */}
        {(() => {
          const displayName = formatFirstAndLastName(dashboardData.name);
          const initials = displayName
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('');

          return (
            <View style={styles.welcomeCard}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.welcomeInfo}>
                <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.userEmail} numberOfLines={1} ellipsizeMode="middle">{dashboardData.email}</Text>
                <Text style={styles.userMeta} numberOfLines={1}>Anno Sportivo: {dashboardData.academicYear}</Text>
              </View>
            </View>
          );
        })()}

        {/* Medical Certificate Banner */}
        <View style={styles.certCard}>
          <View style={styles.certIconContainer}>
            <Text style={styles.certIcon}>🛡️</Text>
          </View>
          <View style={styles.certContent}>
            <View style={styles.certHeaderRow}>
              <Text style={styles.certTitle}>Certificato Medico</Text>
              <View style={styles.activeTag}>
                <Text style={styles.activeTagText}>VALIDO</Text>
              </View>
            </View>
            <Text style={styles.certDetails}>
              Scadenza: <Text style={styles.boldText}>{dashboardData.medicalCertExpiry}</Text> • Non Agonistica
            </Text>
          </View>
        </View>

        {/* 1. Scheda dove prenotare: Active Subscription Card (Body Building) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardSubHeader}>ABBONAMENTO ATTIVO</Text>
              <Text style={styles.cardMainTitle}>{dashboardData.subscription.title}</Text>
            </View>
            <View style={styles.codeBadge}>
              <Text style={styles.codeBadgeText}>{dashboardData.subscription.code}</Text>
            </View>
          </View>

          {/* Progress Bar & Counters */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBarBackground}>
              <View style={[styles.progressBarFill, { width: `${usagePercentage}%` }]} />
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{dashboardData.subscription.remaining}</Text>
                <Text style={styles.statLabel}>Rimanenti</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{dashboardData.subscription.used}</Text>
                <Text style={styles.statLabel}>Usufruiti</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{dashboardData.subscription.total}</Text>
                <Text style={styles.statLabel}>Totale</Text>
              </View>
            </View>
          </View>

          <Text style={styles.validityNotice}>
            Validità: {dashboardData.subscription.validity}
          </Text>

          {/* Quick Action Button */}
          <TouchableOpacity
            style={styles.bookActionBtn}
            onPress={handleOpenBookingModal}
            activeOpacity={0.85}
          >
            <Text style={styles.bookActionBtnIcon}>📅</Text>
            <Text style={styles.bookActionBtnText}>PRENOTA TURNO PALESTRA</Text>
          </TouchableOpacity>
        </View>

        {/* 2. Scheda dove visualizzare i dettagli: Existing Reservations Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.cardTitle}>Le Tue Prenotazioni</Text>
              <Text style={styles.cancelRuleNotice}>Cancellabile fino a 1 ora prima del turno</Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{activeReservations.length}</Text>
            </View>
          </View>

          {activeReservations.length === 0 ? (
            <View style={styles.emptyReservations}>
              <Text style={styles.emptyIcon}>🗓️</Text>
              <Text style={styles.emptyText}>Nessuna prenotazione attiva al momento.</Text>
            </View>
          ) : (
            activeReservations.map((res) => {
              const cancelInfo = getCancelInfo(res, nowTime);

              return (
                <View key={res.id} style={styles.reservationItem}>
                  <View style={styles.resTopRow}>
                    <View style={styles.resTag}>
                      <Text style={styles.resTagText}>PRENOTATO</Text>
                    </View>
                    <Text style={styles.resIdText}>#{res.id}</Text>
                  </View>

                  <Text style={styles.resCourseTitle}>{res.title}</Text>

                  <View style={styles.resDetailRow}>
                    <Text style={styles.resDetailIcon}>📆</Text>
                    <Text style={styles.resDetailText}>{res.date}</Text>
                  </View>
                  <View style={styles.resDetailRow}>
                    <Text style={styles.resDetailIcon}>⏰</Text>
                    <Text style={styles.resDetailText}>{res.time}</Text>
                  </View>

                  {/* Countdown Timer or Expired Badge */}
                  {cancelInfo.canCancel ? (
                    <View style={styles.timerBoxActive}>
                      <View style={styles.timerTopRow}>
                        <View style={styles.timerTitleWrap}>
                          <Text style={styles.timerIcon}>⏱️</Text>
                          <Text style={styles.timerLabel}>Tempo per disdire</Text>
                        </View>
                        <View style={styles.timerDigitsBadge}>
                          <Text style={styles.timerDigits}>{cancelInfo.timeFormatted}</Text>
                        </View>
                      </View>
                      <Text style={styles.timerSubDeadline}>
                        Disdetta consentita fino alle {cancelInfo.deadlineStr}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.timerBoxExpired}>
                      <Text style={styles.timerExpiredIcon}>🔒</Text>
                      <Text style={styles.timerExpiredText}>
                        Termine annullamento scaduto alle {cancelInfo.deadlineStr} (1 ora prima del turno)
                      </Text>
                    </View>
                  )}

                  {/* Actions Row - Only shown when reservation can be cancelled */}
                  {cancelInfo.canCancel && (
                    <View style={styles.resActionsRow}>
                      <TouchableOpacity
                        style={[
                          styles.cancelResBtn,
                          cancellingResId === res.id && styles.cancelResBtnLoading,
                        ]}
                        onPress={() => handlePromptCancel(res)}
                        disabled={cancellingResId !== null}
                        activeOpacity={0.7}
                      >
                        {cancellingResId === res.id ? (
                          <View style={styles.cancelLoadingInline}>
                            <ActivityIndicator size="small" color="#DC2626" />
                            <Text style={styles.cancelResBtnLoadingText}>
                              Annullamento...
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.cancelResBtnText}>Annulla Prenotazione</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* 3. Scheda Affluenza: Native In-App Real-Time Crowd Analytics Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardSubHeader}>MONITORAGGIO IN TEMPO REALE</Text>
              <Text style={styles.cardMainTitle}>Stima Affluenza Sala Pesi</Text>
              <Text style={styles.cardSubLocation}>CUS Unical • Dati Google Maps</Text>
            </View>
          </View>

          {/* Day selection tabs */}
          <ScrollView
            ref={crowdTabsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.crowdDayTabsScroll}
            style={styles.crowdDayTabsContainer}
          >
            {[
              { id: 'lunedi', label: 'Lunedì' },
              { id: 'martedi', label: 'Martedì' },
              { id: 'mercoledi', label: 'Mercoledì' },
              { id: 'giovedi', label: 'Giovedì' },
              { id: 'venerdi', label: 'Venerdì' },
              { id: 'sabato', label: 'Sabato' },
              { id: 'domenica', label: 'Domenica', isClosed: true },
            ].map((tab) => {
              const isActive = selectedCrowdDay === tab.id;
              const isToday = todayCrowdKey === tab.id;
              const hasLiveIndicator = isToday && isGymOpenNow;
              let displayLabel = tab.label;

              if (isToday) {
                if (tab.id === 'domenica') {
                  displayLabel = `${tab.label} (Oggi • Chiuso)`;
                } else if (!isGymOpenNow) {
                  displayLabel = currentHour < 10
                    ? `${tab.label} (Oggi • Apre alle 10)`
                    : `${tab.label} (Oggi • Chiuso)`;
                } else if (tab.id === 'sabato') {
                  displayLabel = `${tab.label} (Oggi • Mattina)`;
                } else {
                  displayLabel = `${tab.label} (Oggi • LIVE)`;
                }
              }

              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.crowdDayTab,
                    isActive && styles.crowdDayTabActive,
                    hasLiveIndicator && !isActive && styles.crowdDayTabLiveBorder,
                  ]}
                  onPress={() => setSelectedCrowdDay(tab.id)}
                  activeOpacity={0.8}
                >
                  {hasLiveIndicator && <View style={styles.tabLiveDot} />}
                  <Text
                    style={[
                      styles.crowdDayTabText,
                      isActive && styles.crowdDayTabTextActive,
                      hasLiveIndicator && !isActive && { color: '#0284C7', fontWeight: '700' },
                    ]}
                  >
                    {displayLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Sunday Closed */}
          {selectedCrowdDay === 'domenica' ? (
            <View style={styles.closedWeekendBox}>
              <Text style={styles.closedWeekendEmoji}>🏖️</Text>
              <Text style={styles.closedWeekendTitle}>Chiuso la Domenica</Text>
              <Text style={styles.closedWeekendSubtitle}>
                La sala pesi e il centro sportivo CUS sono chiusi la domenica.
              </Text>
              <View style={styles.reopenBadge}>
                <Text style={styles.reopenBadgeText}>Riapertura: Lunedì alle ore 10:00</Text>
              </View>
            </View>
          ) : selectedCrowdDay === 'sabato' ? (
            /* Saturday Morning Special Notice & Shifts - NO FAKE ESTIMATES */
            <View style={styles.saturdayNoticeBox}>
              <View style={styles.saturdayHeaderRow}>
                <Text style={styles.saturdayTitle}>Sabato: Aperto Mattina</Text>
                <View style={styles.shiftsBadge}>
                  <Text style={styles.shiftsBadgeText}>2 TURNI</Text>
                </View>
              </View>
              <Text style={styles.saturdayNoticeText}>
                La sala pesi del CUS è aperta la mattina con due turni disponibili:
              </Text>
              <View style={styles.saturdayShiftsGrid}>
                <View style={styles.saturdayShiftCard}>
                  <Text style={styles.shiftTime}>10:00 - 12:00</Text>
                  <Text style={styles.shiftDesc}>1° Turno Mattina</Text>
                </View>
                <View style={styles.saturdayShiftCard}>
                  <Text style={styles.shiftTime}>12:00 - 14:00</Text>
                  <Text style={styles.shiftDesc}>2° Turno Mattina</Text>
                </View>
              </View>
              <Text style={styles.saturdayAfternoonClosed}>Pomeriggio e sera: Chiuso</Text>

              <View style={styles.noEstimatesAlertBox}>
                <Text style={styles.noEstimatesAlertIcon}>ℹ️</Text>
                <Text style={styles.noEstimatesAlertText}>
                  Stime di affluenza non disponibili: Google Maps non rileva dati per la giornata di sabato.
                </Text>
              </View>
            </View>
          ) : (
            <>
              {/* Current Live / Day Status Box */}
              <View style={styles.currentCrowdBox}>
                {isTodaySelected && isGymOpenNow ? (
                  <>
                    {/* Centered Live Badge & Last Update */}
                    <View style={styles.liveCenteredHeader}>
                      <View style={styles.livePillSmall}>
                        <View style={styles.livePulsingDot} />
                        <Text style={styles.livePillSmallText}>LIVE • {activeDayData.name.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.lastUpdateCentered} numberOfLines={1}>
                        Aggiornato: ore {lastCrowdRefresh}
                      </Text>
                    </View>

                    <View style={styles.liveStatusRowCentered}>
                      <Text style={styles.liveStatusSubtitle}>Rilevamento Live Ora:</Text>
                      <Text style={[styles.liveStatusValue, { color: liveCrowdItem.color }]}>
                        {liveCrowdItem.level} • ~{liveCrowdItem.percent}%
                      </Text>
                    </View>

                    {/* Progress bars */}
                    <View style={styles.comparisonContainer}>
                      <View style={styles.comparisonBarGroup}>
                        <View style={styles.comparisonBarLabelRow}>
                          <Text style={styles.comparisonLabel} numberOfLines={1} ellipsizeMode="tail">
                            Attuale ({liveCrowdItem.label}):
                          </Text>
                          <Text style={[styles.comparisonValue, { color: liveCrowdItem.color }]}>
                            {liveCrowdItem.percent}% • {liveCrowdItem.comparisonStatus || getCrowdComparisonLabel(liveCrowdItem.percent, liveCrowdItem.typical)}
                          </Text>
                        </View>
                        <View style={styles.comparisonBarTrack}>
                          <View
                            style={[
                              styles.comparisonBarFill,
                              {
                                width: `${liveCrowdItem.percent}%`,
                                backgroundColor: liveCrowdItem.color,
                              },
                            ]}
                          />
                        </View>
                      </View>

                      <View style={styles.comparisonBarGroup}>
                        <View style={styles.comparisonBarLabelRow}>
                          <Text style={styles.comparisonLabel} numberOfLines={1} ellipsizeMode="tail">
                            Media {activeDayData.name} ({liveCrowdItem.label}):
                          </Text>
                          <Text style={[styles.comparisonValue, { color: '#64748B' }]}>
                            ~{liveCrowdItem.typical}% • Consueto
                          </Text>
                        </View>
                        <View style={styles.comparisonBarTrack}>
                          <View
                            style={[
                              styles.comparisonBarFill,
                              { width: `${liveCrowdItem.typical}%`, backgroundColor: '#94A3B8' },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.liveCenteredHeader}>
                      <View style={styles.historicalPill}>
                        <Text style={styles.historicalPillText}>
                          {isTodaySelected ? (currentHour < 10 ? 'OGGI • APRE ALLE 10:00' : 'OGGI • PALESTRA CHIUSA') : `MEDIA • ${activeDayData.name.toUpperCase()}`}
                        </Text>
                      </View>
                      <Text style={styles.lastUpdateCentered}>Google Maps</Text>
                    </View>
                    <View style={styles.liveStatusRowCentered}>
                      <Text style={styles.liveStatusSubtitle}>Stima Tipica {activeDayData.name}:</Text>
                      <Text style={[styles.liveStatusValue, { color: '#0284C7' }]}>
                        Orario di punta: 18:00 - 20:30
                      </Text>
                    </View>
                    <Text style={[styles.daySummaryDesc, { textAlign: 'center' }]}>
                      Fasce consigliate e poco affollate: 10:00 - 15:00 (~15-25% di affluenza).
                    </Text>
                  </>
                )}
              </View>

              {/* Clean Hourly Bar Chart with Habitual Level in Grey for Current Bar */}
              <View style={styles.crowdChartContainer}>
                {activeCrowdList.map((item) => {
                  const isLiveNow = isTodaySelected && isGymOpenNow && item.hour === currentHour;
                  const barHeight = Math.max(14, Math.round((item.percent / 100) * 80));
                  const typicalHeight = Math.max(14, Math.round((item.typical / 100) * 80));

                  return (
                    <View key={item.hour} style={styles.crowdChartCol}>
                      <Text
                        style={[
                          styles.crowdBarVal,
                          isLiveNow && { color: '#10B981', fontWeight: '800' },
                        ]}
                      >
                        {item.percent}%
                      </Text>
                      <View style={styles.crowdBarTrack}>
                        {/* Habitual / typical level in grey behind/underneath the current live bar */}
                        {isLiveNow && (
                          <View
                            style={[
                              styles.crowdBarTypicalFill,
                              {
                                height: typicalHeight,
                              },
                            ]}
                          />
                        )}
                        <View
                          style={[
                            styles.crowdBarFill,
                            {
                              height: barHeight,
                              backgroundColor: isLiveNow
                                ? (item.color || '#10B981')
                                : item.color || '#CBD5E1',
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.crowdHourLabel}>
                        {item.label.split(':')[0]}
                      </Text>
                      {isLiveNow ? (
                        <Text style={[styles.nowBadgeText, { color: '#10B981' }]}>LIVE</Text>
                      ) : (
                        <View style={{ height: 12 }} />
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* University Info Card */}
        <View style={styles.uniCard}>
          <Text style={styles.uniTitle}>Convenzione Studente</Text>
          <Text style={styles.uniText}>
            Università della Calabria • Ingegneria Informatica (DIMES)
          </Text>
          <Text style={styles.uniMatricola}>Matricola: 290949</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Redesigned Modern Booking Modal */}
      <Modal
        visible={isBookingModalVisible}
        transparent={true}
        animationType="slide"
        statusBarTranslucent={true}
        navigationBarTranslucent={true}
        onRequestClose={() => setIsBookingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalPreTitle}>PRENOTAZIONE ATTIVITÀ</Text>
                <Text style={styles.modalTitle}>Sala Body Building</Text>
                <Text style={styles.modalSubLocation}>CUS Cosenza • Anno 2026/2027</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsBookingModalVisible(false)}
                style={styles.modalCloseBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* Notice Banner */}
              <View style={styles.bookingRuleBox}>
                <Text style={styles.bookingRuleIcon}>ℹ️</Text>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={styles.bookingRuleText}>
                    Le prenotazioni possono essere annullate fino a 1 ora prima dell'inizio del turno. L'ingresso viene scalato al tornello.
                  </Text>
                  <Text style={[styles.bookingRuleText, { color: '#0369A1' }]}>
                    Le pillole di affluenza dei turni si basano su medie statistiche storiche: l'unico dato certo in tempo reale è l'affluenza attuale visualizzata nella scheda monitoraggio in Home.
                  </Text>
                </View>
              </View>

              {/* GinniPAL Official Alert when no periods are bookable (e.g. Saturday afternoon) */}
              {!hasAnyBookableSlot && (
                <View style={styles.noPeriodsWarningBox}>
                  <Text style={styles.noPeriodsWarningIcon}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.noPeriodsWarningTitle}>Attenzione! Non ci sono periodi prenotabili.</Text>
                    <Text style={styles.noPeriodsWarningSub}>
                      {isSelectedSaturday
                        ? 'I turni di oggi sono terminati (la sala pesi chiude alle 14:00 di sabato). Il portale CUS non consente di prenotare il lunedì durante la giornata di sabato.'
                        : 'Tutti i turni per questa giornata sono già passati o conclusi.'}
                    </Text>
                  </View>
                </View>
              )}

              {/* 1. Day Selection: Oggi e Domani */}
              <View style={styles.modalSectionHeaderRow}>
                <Text style={styles.modalSectionLabel}>1. Scegli il Giorno</Text>
                <Text style={styles.modalSectionHelper}>Seleziona data turno</Text>
              </View>

              <View style={styles.dayPillsRow}>
                {AVAILABLE_DAYS.map((day) => {
                  const isSelected = selectedDay === day.date;
                  const label = `${day.tag ? `${day.tag} • ` : ''}${day.dayName} ${day.dayNum} ${day.monthName}`;
                  return (
                    <TouchableOpacity
                      key={day.date}
                      style={[
                        styles.dayPillTab,
                        isSelected && styles.dayPillTabActive,
                      ]}
                      onPress={() => handleSelectBookingDay(day.date)}
                      activeOpacity={0.8}
                    >
                      {day.tag === 'Oggi' && (
                        <View style={[styles.dayPillDot, isSelected && styles.dayPillDotActive]} />
                      )}
                      <Text
                        style={[
                          styles.dayPillTabText,
                          isSelected && styles.dayPillTabTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 2. Slot Selection */}
              <View style={styles.modalSectionHeaderRow}>
                <Text style={styles.modalSectionLabel}>2. Scegli il Turno</Text>
                {isSelectedSaturday ? (
                  <View style={styles.saturdayBadgeTag}>
                    <Text style={styles.saturdayBadgeTagText}>ORARIO SABATO 10-14</Text>
                  </View>
                ) : (
                  <Text style={styles.modalSectionHelper}>Seleziona fascia oraria</Text>
                )}
              </View>

              {isSelectedSaturday ? (
                /* Saturday: only the 2 morning shifts */
                <View style={styles.saturdayBookingSection}>
                  <View style={styles.slotGridTwoCol}>
                    {SATURDAY_BOOKING_SLOTS.map((item) => {
                      const isAlreadyBooked = isSlotAlreadyBookedByUser(item.slot, selectedDay);
                      const isBookable = isSlotBookable(item.slot, isSelectedToday, currentHour) && !isAlreadyBooked;
                      const isSelected = selectedSlot === item.slot && isBookable;
                      return (
                        <TouchableOpacity
                          key={item.slot}
                          disabled={!isBookable}
                          style={[
                            styles.slotTile,
                            isSelected && styles.slotTileSelected,
                            !isBookable && styles.slotTileDisabled,
                            isAlreadyBooked && styles.slotTileBooked,
                          ]}
                          onPress={() => isBookable && setSelectedSlot(item.slot)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.slotTileHeader}>
                            <Text
                              style={[
                                styles.slotTileTime,
                                isSelected && styles.slotTileTimeSelected,
                                !isBookable && styles.slotTileTimeDisabled,
                                isAlreadyBooked && styles.slotTileTimeBooked,
                              ]}
                            >
                              {item.slot}
                            </Text>
                            <View
                              style={[
                                styles.slotRadio,
                                isSelected && styles.slotRadioSelected,
                                (!isBookable || isAlreadyBooked) && styles.slotRadioDisabled,
                              ]}
                            >
                              {isAlreadyBooked ? (
                                <Text style={styles.slotRadioLocked}>🔒</Text>
                              ) : isSelected ? (
                                <Text style={styles.slotRadioCheck}>✓</Text>
                              ) : null}
                            </View>
                          </View>
                          <View style={styles.slotTileFooter}>
                            <Text
                              style={[
                                styles.slotPeriodText,
                                isSelected && styles.slotPeriodTextSelected,
                                !isBookable && styles.slotPeriodTextDisabled,
                              ]}
                            >
                              {item.periodLabel}
                            </Text>
                            {isAlreadyBooked ? (
                              <View style={styles.slotBookedPill}>
                                <Text style={styles.slotBookedText}>Già prenotato</Text>
                              </View>
                            ) : isBookable ? (
                              <View style={[styles.crowdPill, { backgroundColor: getSlotDynamicCrowd(item.slot, selectedDay).bgColor }]}>
                                <View style={[styles.crowdDotSmall, { backgroundColor: getSlotDynamicCrowd(item.slot, selectedDay).dotColor }]} />
                                <Text style={[styles.crowdPillText, { color: getSlotDynamicCrowd(item.slot, selectedDay).textColor }]}>
                                  {getSlotDynamicCrowd(item.slot, selectedDay).badgeText}
                                </Text>
                              </View>
                            ) : (
                              <View style={styles.slotDisabledPill}>
                                <Text style={styles.slotDisabledText}>Non disp.</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.saturdayClosedBanner}>
                    <Text style={styles.saturdayClosedBannerText}>
                      🔒 Pomeriggio chiuso: la sala pesi del CUS chiude alle 14:00 di sabato.
                    </Text>
                  </View>
                </View>
              ) : (
                /* Weekdays: categorized by Mattina / Pomeriggio / Sera */
                <View style={styles.weekdayBookingSection}>
                  {/* Mattina */}
                  <View style={styles.slotCategoryGroup}>
                    <View style={styles.slotCategoryHeader}>
                      <Text style={styles.slotCategoryIcon}>☀️</Text>
                      <Text style={styles.slotCategoryTitle}>Mattina (10:00 - 14:00)</Text>
                    </View>
                    <View style={styles.slotGridTwoCol}>
                      {WEEKDAY_BOOKING_SLOTS.filter((s) => s.category === 'mattina').map((item) => {
                        const isAlreadyBooked = isSlotAlreadyBookedByUser(item.slot, selectedDay);
                        const isBookable = isSlotBookable(item.slot, isSelectedToday, currentHour) && !isAlreadyBooked;
                        const isSelected = selectedSlot === item.slot && isBookable;
                        return (
                          <TouchableOpacity
                            key={item.slot}
                            disabled={!isBookable}
                            style={[
                              styles.slotTile,
                              isSelected && styles.slotTileSelected,
                              !isBookable && styles.slotTileDisabled,
                              isAlreadyBooked && styles.slotTileBooked,
                            ]}
                            onPress={() => isBookable && setSelectedSlot(item.slot)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.slotTileHeader}>
                              <Text
                                style={[
                                  styles.slotTileTime,
                                  isSelected && styles.slotTileTimeSelected,
                                  !isBookable && styles.slotTileTimeDisabled,
                                  isAlreadyBooked && styles.slotTileTimeBooked,
                                ]}
                              >
                                {item.slot}
                              </Text>
                              <View
                                style={[
                                  styles.slotRadio,
                                  isSelected && styles.slotRadioSelected,
                                  (!isBookable || isAlreadyBooked) && styles.slotRadioDisabled,
                                ]}
                              >
                                {isAlreadyBooked ? (
                                  <Text style={styles.slotRadioLocked}>🔒</Text>
                                ) : isSelected ? (
                                  <Text style={styles.slotRadioCheck}>✓</Text>
                                ) : null}
                              </View>
                            </View>
                            <View style={styles.slotTileFooter}>
                              <Text
                                style={[
                                  styles.slotPeriodText,
                                  isSelected && styles.slotPeriodTextSelected,
                                  !isBookable && styles.slotPeriodTextDisabled,
                                ]}
                              >
                                {item.periodLabel}
                              </Text>
                              {isAlreadyBooked ? (
                                <View style={styles.slotBookedPill}>
                                  <Text style={styles.slotBookedText}>Già prenotato</Text>
                                </View>
                              ) : isBookable ? (
                                <View style={[styles.crowdPill, { backgroundColor: getSlotDynamicCrowd(item.slot, selectedDay).bgColor }]}>
                                  <View style={[styles.crowdDotSmall, { backgroundColor: getSlotDynamicCrowd(item.slot, selectedDay).dotColor }]} />
                                  <Text style={[styles.crowdPillText, { color: getSlotDynamicCrowd(item.slot, selectedDay).textColor }]}>
                                    {getSlotDynamicCrowd(item.slot, selectedDay).badgeText}
                                  </Text>
                                </View>
                              ) : (
                                <View style={styles.slotDisabledPill}>
                                  <Text style={styles.slotDisabledText}>Non disp.</Text>
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Pomeriggio */}
                  <View style={styles.slotCategoryGroup}>
                    <View style={styles.slotCategoryHeader}>
                      <Text style={styles.slotCategoryIcon}>🌤️</Text>
                      <Text style={styles.slotCategoryTitle}>Pomeriggio (14:00 - 18:00)</Text>
                    </View>
                    <View style={styles.slotGridTwoCol}>
                      {WEEKDAY_BOOKING_SLOTS.filter((s) => s.category === 'pomeriggio').map((item) => {
                        const isAlreadyBooked = isSlotAlreadyBookedByUser(item.slot, selectedDay);
                        const isBookable = isSlotBookable(item.slot, isSelectedToday, currentHour) && !isAlreadyBooked;
                        const isSelected = selectedSlot === item.slot && isBookable;
                        return (
                          <TouchableOpacity
                            key={item.slot}
                            disabled={!isBookable}
                            style={[
                              styles.slotTile,
                              isSelected && styles.slotTileSelected,
                              !isBookable && styles.slotTileDisabled,
                              isAlreadyBooked && styles.slotTileBooked,
                            ]}
                            onPress={() => isBookable && setSelectedSlot(item.slot)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.slotTileHeader}>
                              <Text
                                style={[
                                  styles.slotTileTime,
                                  isSelected && styles.slotTileTimeSelected,
                                  !isBookable && styles.slotTileTimeDisabled,
                                  isAlreadyBooked && styles.slotTileTimeBooked,
                                ]}
                              >
                                {item.slot}
                              </Text>
                              <View
                                style={[
                                  styles.slotRadio,
                                  isSelected && styles.slotRadioSelected,
                                  (!isBookable || isAlreadyBooked) && styles.slotRadioDisabled,
                                ]}
                              >
                                {isAlreadyBooked ? (
                                  <Text style={styles.slotRadioLocked}>🔒</Text>
                                ) : isSelected ? (
                                  <Text style={styles.slotRadioCheck}>✓</Text>
                                ) : null}
                              </View>
                            </View>
                            <View style={styles.slotTileFooter}>
                              <Text
                                style={[
                                  styles.slotPeriodText,
                                  isSelected && styles.slotPeriodTextSelected,
                                  !isBookable && styles.slotPeriodTextDisabled,
                                ]}
                              >
                                {item.periodLabel}
                              </Text>
                              {isAlreadyBooked ? (
                                <View style={styles.slotBookedPill}>
                                  <Text style={styles.slotBookedText}>Già prenotato</Text>
                                </View>
                              ) : isBookable ? (
                                <View style={[styles.crowdPill, { backgroundColor: getSlotDynamicCrowd(item.slot, selectedDay).bgColor }]}>
                                  <View style={[styles.crowdDotSmall, { backgroundColor: getSlotDynamicCrowd(item.slot, selectedDay).dotColor }]} />
                                  <Text style={[styles.crowdPillText, { color: getSlotDynamicCrowd(item.slot, selectedDay).textColor }]}>
                                    {getSlotDynamicCrowd(item.slot, selectedDay).badgeText}
                                  </Text>
                                </View>
                              ) : (
                                <View style={styles.slotDisabledPill}>
                                  <Text style={styles.slotDisabledText}>Non disp.</Text>
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Sera */}
                  <View style={styles.slotCategoryGroup}>
                    <View style={styles.slotCategoryHeader}>
                      <Text style={styles.slotCategoryIcon}>🌙</Text>
                      <Text style={styles.slotCategoryTitle}>Sera (18:00 - 22:00)</Text>
                    </View>
                    <View style={styles.slotGridTwoCol}>
                      {WEEKDAY_BOOKING_SLOTS.filter((s) => s.category === 'sera').map((item) => {
                        const isAlreadyBooked = isSlotAlreadyBookedByUser(item.slot, selectedDay);
                        const isBookable = isSlotBookable(item.slot, isSelectedToday, currentHour) && !isAlreadyBooked;
                        const isSelected = selectedSlot === item.slot && isBookable;
                        const isPeak = item.slot === '18:00 - 20:00';
                        return (
                          <TouchableOpacity
                            key={item.slot}
                            disabled={!isBookable}
                            style={[
                              styles.slotTile,
                              isSelected && styles.slotTileSelected,
                              !isBookable && styles.slotTileDisabled,
                              isAlreadyBooked && styles.slotTileBooked,
                            ]}
                            onPress={() => isBookable && setSelectedSlot(item.slot)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.slotTileHeader}>
                              <Text
                                style={[
                                  styles.slotTileTime,
                                  isSelected && styles.slotTileTimeSelected,
                                  !isBookable && styles.slotTileTimeDisabled,
                                  isAlreadyBooked && styles.slotTileTimeBooked,
                                ]}
                              >
                                {item.slot}
                              </Text>
                              <View
                                style={[
                                  styles.slotRadio,
                                  isSelected && styles.slotRadioSelected,
                                  (!isBookable || isAlreadyBooked) && styles.slotRadioDisabled,
                                ]}
                              >
                                {isAlreadyBooked ? (
                                  <Text style={styles.slotRadioLocked}>🔒</Text>
                                ) : isSelected ? (
                                  <Text style={styles.slotRadioCheck}>✓</Text>
                                ) : null}
                              </View>
                            </View>
                            <View style={styles.slotTileFooter}>
                              <Text
                                style={[
                                  styles.slotPeriodText,
                                  isSelected && styles.slotPeriodTextSelected,
                                  !isBookable && styles.slotPeriodTextDisabled,
                                ]}
                              >
                                {item.periodLabel}
                              </Text>
                              {isAlreadyBooked ? (
                                <View style={styles.slotBookedPill}>
                                  <Text style={styles.slotBookedText}>Già prenotato</Text>
                                </View>
                              ) : isBookable ? (
                                <View style={[styles.crowdPill, { backgroundColor: getSlotDynamicCrowd(item.slot, selectedDay).bgColor }]}>
                                  <View style={[styles.crowdDotSmall, { backgroundColor: getSlotDynamicCrowd(item.slot, selectedDay).dotColor }]} />
                                  <Text style={[styles.crowdPillText, { color: getSlotDynamicCrowd(item.slot, selectedDay).textColor }]}>
                                    {getSlotDynamicCrowd(item.slot, selectedDay).badgeText}
                                  </Text>
                                </View>
                              ) : (
                                <View style={styles.slotDisabledPill}>
                                  <Text style={styles.slotDisabledText}>Non disp.</Text>
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}

              {/* 3. Booking Summary Card */}
              <View style={[styles.bookingSummaryBox, (!selectedSlot || !isSelectedSlotBookable) && styles.bookingSummaryBoxDisabled]}>
                <View style={styles.summaryHeaderRow}>
                  <View style={styles.summaryTitleGroup}>
                    <Text style={styles.summaryBadge}>RIEPILOGO</Text>
                    <Text style={[styles.summaryTitle, (!selectedSlot || !isSelectedSlotBookable) && { color: '#64748B' }]}>
                      Dettagli del Turno
                    </Text>
                  </View>
                  <View style={[styles.activityBadge, (!selectedSlot || !isSelectedSlotBookable) && styles.activityBadgeDisabled]}>
                    <Text style={[styles.activityBadgeText, (!selectedSlot || !isSelectedSlotBookable) && { color: '#94A3B8' }]}>
                      BODY BUILDING
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryItemLabel}>Data Selezionata</Text>
                    <Text style={styles.summaryItemValue}>
                      {selectedDayObj.dayName} {selectedDayObj.dayNum} {selectedDayObj.monthName} ({selectedDay})
                    </Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryItemLabel}>Orario Turno</Text>
                    <Text
                      style={[
                        styles.summaryItemValue,
                        selectedSlot && isSelectedSlotBookable
                          ? { color: '#0284C7', fontWeight: '800' }
                          : { color: '#94A3B8', fontWeight: '500' },
                      ]}
                    >
                      {selectedSlot && isSelectedSlotBookable ? selectedSlot : '—'}
                    </Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryItemLabel}>Affluenza Prevista</Text>
                    <Text
                      style={[
                        styles.summaryItemValue,
                        selectedSlot && isSelectedSlotBookable
                          ? { color: getSlotDynamicCrowd(selectedSlot, selectedDay).dotColor, fontWeight: '700' }
                          : { color: '#94A3B8', fontWeight: '500' },
                      ]}
                    >
                      {selectedSlot && isSelectedSlotBookable
                        ? getSlotDynamicCrowd(selectedSlot, selectedDay).label
                        : '—'}
                    </Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryItemLabel}>Ingressi Abbonamento</Text>
                    <Text
                      style={[
                        styles.summaryItemValue,
                        selectedSlot && isSelectedSlotBookable
                          ? { color: '#1E293B', fontWeight: '700' }
                          : { color: '#94A3B8', fontWeight: '500' },
                      ]}
                    >
                      {selectedSlot && isSelectedSlotBookable
                        ? `1 ingresso (${dashboardData.subscription.remaining} rimanenti ➜ ${Math.max(
                            0,
                            dashboardData.subscription.remaining - 1
                          )})`
                        : '—'}
                    </Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryItemLabel}>Disdetta Gratuita</Text>
                    <Text
                      style={[
                        styles.summaryItemValue,
                        selectedSlot && isSelectedSlotBookable
                          ? { color: '#0369A1', fontWeight: '700' }
                          : { color: '#94A3B8', fontWeight: '500' },
                      ]}
                    >
                      {selectedSlot && isSelectedSlotBookable
                        ? getSlotDeadlineText(selectedSlot, selectedDay)
                        : '—'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Confirm Booking Button */}
              <TouchableOpacity
                style={[
                  styles.confirmBookingBtn,
                  (!hasAnyBookableSlot || !selectedSlot || !isSelectedSlotBookable || isSubmittingBooking) && {
                    backgroundColor: '#94A3B8',
                  },
                ]}
                onPress={handleConfirmBooking}
                disabled={!hasAnyBookableSlot || !selectedSlot || !isSelectedSlotBookable || isSubmittingBooking}
                activeOpacity={0.85}
              >
                {isSubmittingBooking ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.confirmBookingBtnText}>
                      {!hasAnyBookableSlot
                        ? 'NON CI SONO PERIODI PRENOTABILI'
                        : !selectedSlot
                        ? 'SELEZIONA UN TURNO'
                        : isSelectedSlotBookable
                        ? 'CONFERMA E PRENOTA ORA'
                        : 'TURNO NON DISPONIBILE'}
                    </Text>
                    <Text style={styles.confirmBookingBtnSub}>
                      {!hasAnyBookableSlot
                        ? isSelectedSaturday
                          ? 'Il portale CUS apre le prenotazioni per lunedì solo da domenica'
                          : 'Nessun turno disponibile per questa data'
                        : !selectedSlot
                        ? 'Tocca una delle fasce orarie disponibili'
                        : isSelectedSlotBookable
                        ? "Ingresso convalidato all'accesso al tornello"
                        : 'I turni precedenti sono terminati o già iniziati'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Custom CusApp Style Modal for Cancel Confirmation */}
      <Modal
        visible={confirmCancelModalData !== null}
        transparent
        animationType="fade"
        statusBarTranslucent={true}
        navigationBarTranslucent={true}
        onRequestClose={() => setConfirmCancelModalData(null)}
      >
        <View style={styles.customModalBackdrop}>
          <View style={styles.customConfirmCard}>
            <View style={styles.confirmIconCircle}>
              <Text style={styles.confirmIconEmoji}>⚠️</Text>
            </View>

            <Text style={styles.customConfirmTitle}>Annulla prenotazione</Text>

            <Text style={styles.customConfirmDesc}>
              Vuoi annullare la prenotazione per il turno del{' '}
              <Text style={styles.boldText}>{confirmCancelModalData?.date}</Text> alle ore{' '}
              <Text style={styles.boldText}>{confirmCancelModalData?.time}</Text>?
            </Text>

            <View style={styles.customConfirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => {
                  const id = confirmCancelModalData?.id;
                  setConfirmCancelModalData(null);
                  if (id) {
                    executeCancelReservation(id);
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelBtnText}>Annulla prenotazione</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmKeepBtn}
                onPress={() => setConfirmCancelModalData(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmKeepBtnText}>Torna indietro</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <GinnipalScraper
        ref={scraperRef}
        onLoginSuccess={handleScraperLoginSuccess}
        onLoginError={(err) => Alert.alert('Errore Login', err)}
        onDashboardData={handleScraperDashboardData}
        onBookingSuccess={() => {}}
        onBookingError={(err) => Alert.alert('Errore Prenotazione', err)}
        onCancelSuccess={() => {}}
        onCancelError={(err) => Alert.alert('Errore Annullamento', err)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0284C7',
  },
  contentScrollView: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  scrollContent: {
    padding: 16,
  },

  // Top Bar
  topBar: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#0369A1',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topBarBrand: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgePill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgePillIcon: {
    fontSize: 12,
  },
  badgePillText: {
    color: '#0369A1',
    fontSize: 12,
    fontWeight: '700',
  },
  logoutBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoutBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Welcome Profile Card
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#BAE6FD',
  },
  avatarText: {
    color: '#0284C7',
    fontSize: 19,
    fontWeight: '800',
  },
  welcomeInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 4,
  },
  userMeta: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '600',
  },
  cardOpenHint: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardOpenHintText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },

  // Medical Cert Banner
  certCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 5,
    borderLeftColor: '#10B981',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  certIconContainer: {
    marginRight: 14,
  },
  certIcon: {
    fontSize: 28,
  },
  certContent: {
    flex: 1,
  },
  certHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  certTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  activeTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeTagText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '700',
  },
  certDetails: {
    fontSize: 13,
    color: '#475569',
  },
  boldText: {
    fontWeight: '700',
    color: '#0F172A',
  },

  // Standard Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardSubHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardMainTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  cancelRuleNotice: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  codeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  codeBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
  },

  // In-App Real-Time Crowd Analytics Card Styles
  cardSubLocation: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  refreshLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  refreshLiveBtnIcon: {
    fontSize: 12,
  },
  refreshLiveBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  crowdDayTabsContainer: {
    marginBottom: 14,
  },
  crowdDayTabsScroll: {
    gap: 6,
    paddingRight: 8,
  },
  crowdDayTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 5,
  },
  crowdDayTabActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  crowdDayTabLiveBorder: {
    borderColor: '#38BDF8',
    backgroundColor: '#F0F9FF',
  },
  tabLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  crowdDayTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  crowdDayTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  closedWeekendBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  closedWeekendEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  closedWeekendTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  closedWeekendSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
  },
  reopenBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  reopenBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  liveGoogleBadge: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveGoogleText: {
    color: '#166534',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  saturdayNoticeBox: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  saturdayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  saturdayTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0369A1',
  },
  shiftsBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  shiftsBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  saturdayNoticeText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 17,
    marginBottom: 14,
  },
  saturdayShiftsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  saturdayShiftCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0F2FE',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  shiftTime: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0284C7',
    marginBottom: 4,
  },
  shiftDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  saturdayAfternoonClosed: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '600',
    fontStyle: 'italic',
  },
  noEstimatesAlertBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noEstimatesAlertIcon: {
    fontSize: 14,
  },
  noEstimatesAlertText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
  },
  daySummaryDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 6,
  },
  currentCrowdBox: {
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  liveCenteredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  lastUpdateCentered: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    flexShrink: 0,
  },
  liveStatusRowCentered: {
    alignItems: 'center',
    marginBottom: 12,
  },
  liveStatusSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  liveStatusValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  livePillSmall: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  livePulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  livePillSmallText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#166534',
  },
  historicalPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  historicalPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  comparisonContainer: {
    gap: 8,
  },
  comparisonBarGroup: {},
  comparisonBarLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  comparisonLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    flexShrink: 1,
  },
  comparisonValue: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 0,
    marginLeft: 6,
  },
  comparisonBarTrack: {
    height: 7,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  comparisonBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  crowdChartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 125,
    paddingVertical: 8,
    marginBottom: 4,
  },
  crowdChartCol: {
    alignItems: 'center',
    flex: 1,
  },
  crowdBarVal: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '600',
    marginBottom: 4,
  },
  crowdBarTrack: {
    height: 80,
    width: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
  },
  crowdBarTypicalFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    backgroundColor: '#94A3B8',
    borderRadius: 7,
  },
  crowdBarFill: {
    width: '100%',
    borderRadius: 7,
  },
  crowdHourLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 6,
    fontWeight: '600',
  },
  nowBadgeText: {
    fontSize: 8,
    color: '#10B981',
    fontWeight: '900',
    marginTop: 2,
    height: 12,
  },

  // Progress Bar & Stats
  progressContainer: {
    marginVertical: 8,
  },
  progressBarBackground: {
    height: 10,
    backgroundColor: '#E2E8F0',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0284C7',
    borderRadius: 5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  statBox: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0284C7',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E2E8F0',
  },
  validityNotice: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 12,
    textAlign: 'center',
  },

  // Book Action Button
  bookActionBtn: {
    backgroundColor: '#0284C7',
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  bookActionBtnIcon: {
    fontSize: 18,
  },
  bookActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Count Pill
  countPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countPillText: {
    color: '#0284C7',
    fontSize: 12,
    fontWeight: '800',
  },

  // Reservations List
  emptyReservations: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
  },
  reservationItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  resTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  resTagText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '800',
  },
  resIdText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  resCourseTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  resDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  resDetailIcon: {
    fontSize: 14,
  },
  resDetailText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },

  // Dynamic Countdown Timer Box
  timerBoxActive: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  timerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  timerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerIcon: {
    fontSize: 14,
  },
  timerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  timerDigitsBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  timerDigits: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
    fontVariant: ['tabular-nums'],
  },
  timerSubDeadline: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '500',
    color: '#B45309',
    paddingLeft: 20,
  },

  // Expired cancellation notice
  timerBoxExpired: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerExpiredIcon: {
    fontSize: 14,
  },
  timerExpiredText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
  },

  // Actions
  resActionsRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelResBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelResBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelResBtnLoading: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    paddingHorizontal: 14,
  },
  cancelLoadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelResBtnLoadingText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },

  // Custom Confirmation Modal (CusApp Style)
  customModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  customConfirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  confirmIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  confirmIconEmoji: {
    fontSize: 26,
  },
  customConfirmTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  customConfirmDesc: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  customConfirmActions: {
    width: '100%',
    gap: 10,
  },
  confirmCancelBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  confirmCancelBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  confirmKeepBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmKeepBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },

  // University Card
  uniCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 16,
  },
  uniTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 4,
  },
  uniText: {
    fontSize: 13,
    color: '#1E3A8A',
    lineHeight: 18,
  },
  uniMatricola: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    marginTop: 6,
  },

  // Login Screen Styles
  loginSafeArea: {
    flex: 1,
    backgroundColor: '#F0F6FA',
  },
  loginScrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 80,
  },
  loginInner: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    minHeight: 520,
  },
  brandBox: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brandTitle: {
    fontSize: 44,
    fontWeight: '900',
    color: '#0284C7',
    letterSpacing: -1,
  },
  brandSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 6,
    letterSpacing: 0.2,
  },
  loginCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  loginError: {
    color: '#DC2626',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: '#0284C7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  footerCopy: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 30,
  },

  // Modal Styles (Modern GinniPAL Redesign)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalPreTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#0284C7',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  modalSubLocation: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#475569',
    fontWeight: '700',
    marginTop: -1,
  },

  // Notice Banner
  bookingRuleBox: {
    backgroundColor: '#F0F9FF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bookingRuleIcon: {
    fontSize: 18,
  },
  bookingRuleText: {
    flex: 1,
    fontSize: 12,
    color: '#0369A1',
    lineHeight: 17,
    fontWeight: '500',
  },

  // GinniPAL Warning Banner
  noPeriodsWarningBox: {
    backgroundColor: '#FEF2F2',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  noPeriodsWarningIcon: {
    fontSize: 20,
  },
  noPeriodsWarningTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 4,
  },
  noPeriodsWarningSub: {
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 18,
    fontWeight: '500',
  },

  // Section Headers
  modalSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 8,
    marginBottom: 12,
  },
  modalSectionLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSectionHelper: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  // Day Selector: Pill Tabs
  dayPillsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  dayPillTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  dayPillTabActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  dayPillTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  dayPillTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dayPillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  dayPillDotActive: {
    backgroundColor: '#FFFFFF',
  },
  daySelectorContainer: {
    marginBottom: 16,
  },
  daySelectorScroll: {
    gap: 10,
    paddingRight: 6,
  },
  dayTile: {
    width: 82,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  dayTileSelected: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  dayTileTag: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  dayTileTagSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  dayTileTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0284C7',
    textTransform: 'uppercase',
  },
  dayTileTagTextSelected: {
    color: '#FFFFFF',
  },
  dayTileName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayTileNameSelected: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  dayTileNum: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 2,
  },
  dayTileNumSelected: {
    color: '#FFFFFF',
  },
  dayTileMonth: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  dayTileMonthSelected: {
    color: 'rgba(255, 255, 255, 0.85)',
  },

  // Saturday Badge & Closed Banner
  saturdayBadgeTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  saturdayBadgeTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.4,
  },
  saturdayBookingSection: {
    marginBottom: 16,
  },
  saturdayClosedBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  saturdayClosedBannerText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Weekday Shifts & Categories
  weekdayBookingSection: {
    marginBottom: 16,
  },
  slotCategoryGroup: {
    marginBottom: 14,
  },
  slotCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  slotCategoryIcon: {
    fontSize: 14,
  },
  slotCategoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  slotGridTwoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  // Slot Tiles
  slotTile: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  slotTileDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.5,
  },
  slotTileSelected: {
    backgroundColor: '#F0F9FF',
    borderColor: '#0284C7',
    borderWidth: 2,
  },
  slotTileBooked: {
    backgroundColor: '#F8FAFC',
    borderColor: '#BFDBFE',
    borderWidth: 1.5,
  },
  slotTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  slotTileTime: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  slotTileTimeSelected: {
    color: '#0284C7',
  },
  slotTileTimeDisabled: {
    color: '#94A3B8',
  },
  slotTileTimeBooked: {
    color: '#1E40AF',
  },
  slotRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotRadioSelected: {
    borderColor: '#0284C7',
    backgroundColor: '#0284C7',
  },
  slotRadioDisabled: {
    borderColor: '#CBD5E1',
    backgroundColor: '#E2E8F0',
  },
  slotRadioLocked: {
    fontSize: 9,
  },
  slotRadioCheck: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  slotTileFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  slotPeriodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    flexShrink: 1,
  },
  slotPeriodTextSelected: {
    color: '#0369A1',
    fontWeight: '700',
  },
  slotPeriodTextDisabled: {
    color: '#94A3B8',
  },
  slotAvailablePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  slotAvailableText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
  },
  slotDisabledPill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  slotDisabledText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  slotBookedPill: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  slotBookedText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  crowdPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  crowdDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  crowdPillText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Booking Summary Card
  bookingSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  summaryTitleGroup: {
    flex: 1,
  },
  summaryBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 2,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  activityBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  activityBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 0.5,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  summaryGrid: {
    gap: 8,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  summaryItemLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 0,
  },
  summaryItemValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    flexShrink: 1,
    textAlign: 'right',
  },
  bookingSummaryBoxDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  activityBadgeDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },

  // Sticky Confirm Button
  confirmBookingBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBookingBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  confirmBookingBtnSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },

});
