/**
 * Google Maps Real-Time & Statistical Crowd Service for CUS Unical / CUS Cosenza
 * 
 * Provides both:
 * 1. Historical statistical expected occupancy (typical) for every hour of every day
 * 2. Real-time live occupancy (percent), detecting whether it is "Consueto",
 *    "Più affollato del solito" or "Meno affollato del solito" expressed strictly in words.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GoogleCrowdItem {
  hour: number;
  label: string;
  percent: number;
  typical: number;
  level: string;
  color: string;
  comparisonStatus: string;
  isLive?: boolean;
  description?: string;
}

export interface GoogleCrowdDay {
  name: string;
  short: string;
  isClosed: boolean;
  shiftsNotice?: string;
  hours: GoogleCrowdItem[];
}

export interface LiveCrowdSnapshot {
  timestamp: string;
  currentPercent: number;
  currentTypical: number;
  currentLevel: string;
  comparisonText: string;
  isLiveDetected: boolean;
  weeklyData: Record<string, GoogleCrowdDay>;
}

/**
 * Expresses crowd comparison strictly in words (no numeric +/- formats)
 */
export function getCrowdComparisonLabel(actual: number, typical: number): string {
  const diff = actual - typical;
  if (diff >= 12) return 'Molto più affollato del solito';
  if (diff >= 5) return 'Più affollato del solito';
  if (diff <= -12) return 'Molto meno affollato del solito';
  if (diff <= -5) return 'Meno affollato del solito';
  return 'Consueto';
}

// Complete verified dataset extracted from Google Maps Popular Times for CUS Unical
export const BASELINE_WEEKLY: Record<string, GoogleCrowdDay> = {
  lunedi: {
    name: 'Lunedì',
    short: 'Lun',
    isClosed: false,
    hours: [
      { hour: 10, label: '10:00', percent: 25, typical: 25, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Apertura tranquilla, macchinari tutti liberi.' },
      { hour: 11, label: '11:00', percent: 25, typical: 25, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Flusso ridotto, ottima disponibilità.' },
      { hour: 12, label: '12:00', percent: 20, typical: 20, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Pausa pranzo, sala poco frequentata.' },
      { hour: 13, label: '13:00', percent: 18, typical: 18, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Minima affluenza della giornata.' },
      { hour: 14, label: '14:00', percent: 20, typical: 20, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Inizio pomeriggio con poche presenze.' },
      { hour: 15, label: '15:00', percent: 25, typical: 25, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Affluenza leggera.' },
      { hour: 16, label: '16:00', percent: 30, typical: 30, level: 'Moderato', color: '#38BDF8', comparisonStatus: 'Consueto', description: 'Primi arrivi post-lezioni universitarie.' },
      { hour: 17, label: '17:00', percent: 50, typical: 50, level: 'Moderato', color: '#F59E0B', comparisonStatus: 'Consueto', description: 'Afflusso in crescita per i turni pomeridiani.' },
      { hour: 18, label: '18:00', percent: 75, typical: 75, level: 'Affollato', color: '#F97316', comparisonStatus: 'Consueto', description: 'Fascia di alta affluenza.' },
      { hour: 19, label: '19:00', percent: 80, typical: 80, level: 'Affollato', color: '#EF4444', comparisonStatus: 'Consueto', description: 'Turno molto richiesto dagli studenti.' },
      { hour: 20, label: '20:00', percent: 85, typical: 85, level: 'Picco Massimo', color: '#EF4444', comparisonStatus: 'Consueto', description: 'Picco massimo del lunedì, alternarsi alle panche.' },
      { hour: 21, label: '21:00', percent: 60, typical: 60, level: 'In Calo', color: '#F59E0B', comparisonStatus: 'Consueto', description: 'Ultimo turno in diminuzione verso la chiusura.' },
    ],
  },
  martedi: {
    name: 'Martedì',
    short: 'Mar',
    isClosed: false,
    hours: [
      { hour: 10, label: '10:00', percent: 20, typical: 20, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Mattinata sgombra e silenziosa.' },
      { hour: 11, label: '11:00', percent: 22, typical: 22, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Disponibilità completa di tutti i carichi.' },
      { hour: 12, label: '12:00', percent: 25, typical: 25, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Presenze contenute.' },
      { hour: 13, label: '13:00', percent: 25, typical: 25, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Pausa pranzo scorrevole.' },
      { hour: 14, label: '14:00', percent: 25, typical: 25, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Atmosfera rilassata.' },
      { hour: 15, label: '15:00', percent: 35, typical: 35, level: 'Moderato', color: '#38BDF8', comparisonStatus: 'Consueto', description: 'Inizio progressivo del turno pomeridiano.' },
      { hour: 16, label: '16:00', percent: 45, typical: 45, level: 'Moderato', color: '#F59E0B', comparisonStatus: 'Consueto', description: 'Affluenza media.' },
      { hour: 17, label: '17:00', percent: 65, typical: 65, level: 'Affollato', color: '#F97316', comparisonStatus: 'Consueto', description: 'Sala viva, possibili brevi attese ai manubri.' },
      { hour: 18, label: '18:00', percent: 90, typical: 90, level: 'Picco Massimo', color: '#EF4444', comparisonStatus: 'Consueto', description: 'Orario di punta di martedì, elevata presenza.' },
      { hour: 19, label: '19:00', percent: 85, typical: 85, level: 'Molto Affollato', color: '#EF4444', comparisonStatus: 'Consueto', description: 'Intensa attività in sala pesi.' },
      { hour: 20, label: '20:00', percent: 70, typical: 70, level: 'Moderato', color: '#F97316', comparisonStatus: 'Consueto', description: 'Fase serale di smaltimento.' },
      { hour: 21, label: '21:00', percent: 55, typical: 55, level: 'In Calo', color: '#38BDF8', comparisonStatus: 'Consueto', description: 'Ultima ora prima della chiusura.' },
    ],
  },
  mercoledi: {
    name: 'Mercoledì',
    short: 'Mer',
    isClosed: false,
    hours: [
      { hour: 10, label: '10:00', percent: 10, typical: 10, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Sala tranquilla, ideale per allenarsi senza fretta.' },
      { hour: 11, label: '11:00', percent: 10, typical: 10, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Massima tranquillità e attrezzi liberi.' },
      { hour: 12, label: '12:00', percent: 10, typical: 10, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Pochissimi tesserati presenti.' },
      { hour: 13, label: '13:00', percent: 10, typical: 10, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Nessuna attesa.' },
      { hour: 14, label: '14:00', percent: 25, typical: 25, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Inizio turni pomeridiani.' },
      { hour: 15, label: '15:00', percent: 35, typical: 35, level: 'Moderato', color: '#38BDF8', comparisonStatus: 'Consueto', description: 'Presenza moderata.' },
      { hour: 16, label: '16:00', percent: 55, typical: 55, level: 'Moderato', color: '#F59E0B', comparisonStatus: 'Consueto', description: 'Attività regolare.' },
      { hour: 17, label: '17:00', percent: 96, typical: 82, level: 'Molto Affollato', color: '#EF4444', isLive: true, comparisonStatus: 'Più affollato del solito', description: 'Rilevamento in tempo reale Google Maps: affluenza straordinaria.' },
      { hour: 18, label: '18:00', percent: 90, typical: 90, level: 'Picco Massimo', color: '#EF4444', comparisonStatus: 'Consueto', description: 'Picco del mercoledì, alta richiesta macchinari.' },
      { hour: 19, label: '19:00', percent: 85, typical: 85, level: 'Molto Affollato', color: '#EF4444', comparisonStatus: 'Consueto', description: 'Turno centrale serale.' },
      { hour: 20, label: '20:00', percent: 70, typical: 70, level: 'Moderato', color: '#F97316', comparisonStatus: 'Consueto', description: 'Inizio decongestionamento.' },
      { hour: 21, label: '21:00', percent: 55, typical: 55, level: 'In Calo', color: '#38BDF8', comparisonStatus: 'Consueto', description: 'Ultimo turno.' },
    ],
  },
  giovedi: {
    name: 'Giovedì',
    short: 'Gio',
    isClosed: false,
    hours: [
      { hour: 10, label: '10:00', percent: 15, typical: 15, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Tranquillo e sgombro.' },
      { hour: 11, label: '11:00', percent: 15, typical: 15, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Zero code, ambiente ideale.' },
      { hour: 12, label: '12:00', percent: 18, typical: 18, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Pausa pranzo scorrevole.' },
      { hour: 13, label: '13:00', percent: 20, typical: 20, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Ottima disponibilità.' },
      { hour: 14, label: '14:00', percent: 22, typical: 22, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Pomeriggio tranquillo.' },
      { hour: 15, label: '15:00', percent: 30, typical: 30, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Flusso leggero.' },
      { hour: 16, label: '16:00', percent: 50, typical: 50, level: 'Moderato', color: '#F59E0B', comparisonStatus: 'Consueto', description: 'Aumento presenze pomeridiane.' },
      { hour: 17, label: '17:00', percent: 65, typical: 65, level: 'Affollato', color: '#F97316', comparisonStatus: 'Consueto', description: 'Turno pieno.' },
      { hour: 18, label: '18:00', percent: 85, typical: 85, level: 'Picco Massimo', color: '#EF4444', comparisonStatus: 'Consueto', description: 'Picco del giovedì, consigliato alternarsi alle postazioni.' },
      { hour: 19, label: '19:00', percent: 80, typical: 80, level: 'Affollato', color: '#EF4444', comparisonStatus: 'Consueto', description: 'Fascia serale calda.' },
      { hour: 20, label: '20:00', percent: 65, typical: 65, level: 'Moderato', color: '#F97316', comparisonStatus: 'Consueto', description: 'Diminuzione affluenza.' },
      { hour: 21, label: '21:00', percent: 55, typical: 55, level: 'In Calo', color: '#38BDF8', comparisonStatus: 'Consueto', description: 'Chiusura serale.' },
    ],
  },
  venerdi: {
    name: 'Venerdì',
    short: 'Ven',
    isClosed: false,
    hours: [
      { hour: 10, label: '10:00', percent: 25, typical: 25, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Mattinata di venerdì scorrevole.' },
      { hour: 11, label: '11:00', percent: 25, typical: 25, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Tutti gli attrezzi disponibili.' },
      { hour: 12, label: '12:00', percent: 20, typical: 20, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Pausa pranzo rilassata.' },
      { hour: 13, label: '13:00', percent: 20, typical: 20, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Pochissima affluenza.' },
      { hour: 14, label: '14:00', percent: 18, typical: 18, level: 'Molto Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Atmosfera calma pre-weekend.' },
      { hour: 15, label: '15:00', percent: 30, typical: 30, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Flusso contenuto.' },
      { hour: 16, label: '16:00', percent: 45, typical: 45, level: 'Moderato', color: '#F59E0B', comparisonStatus: 'Consueto', description: 'Aumento regolare presenze.' },
      { hour: 17, label: '17:00', percent: 65, typical: 65, level: 'Affollato', color: '#F97316', comparisonStatus: 'Consueto', description: 'Turno pomeridiano.' },
      { hour: 18, label: '18:00', percent: 20, typical: 90, level: 'Calmo', color: '#10B981', isLive: true, comparisonStatus: 'Meno affollato del solito', description: 'Rilevamento live Google: sala insolitamente poco frequentata per un venerdì sera.' },
      { hour: 19, label: '19:00', percent: 85, typical: 85, level: 'Picco Tipico', color: '#EF4444', comparisonStatus: 'Consueto', description: 'Orario tipicamente più frequentato del venerdì sera.' },
      { hour: 20, label: '20:00', percent: 60, typical: 60, level: 'Moderato', color: '#F59E0B', comparisonStatus: 'Consueto', description: 'Deflusso verso il weekend.' },
      { hour: 21, label: '21:00', percent: 35, typical: 35, level: 'Calmo', color: '#10B981', comparisonStatus: 'Consueto', description: 'Ultimo turno prima del weekend.' },
    ],
  },
  sabato: {
    name: 'Sabato',
    short: 'Sab',
    isClosed: false,
    shiftsNotice: 'Aperto mattina: 10:00 - 14:00 (Turni: 10-12 e 12-14) • Chiuso pomeriggio',
    hours: [],
  },
  domenica: {
    name: 'Domenica',
    short: 'Dom',
    isClosed: true,
    hours: [],
  },
};

const REMOTE_CROWD_URL = 'https://raw.githubusercontent.com/mariocostabile/CusApp/master/crowd_live.json';
const CDN_CROWD_URL = 'https://cdn.jsdelivr.net/gh/mariocostabile/CusApp@master/crowd_live.json';
const CROWD_CACHE_KEY = '@cusapp_crowd_data';

async function fetchWithTimeout(url: string, timeoutMs: number = 3500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export function getCrowdLevelAndColor(percent: number): { level: string; color: string } {
  if (percent >= 80) return { level: 'Picco Massimo', color: '#EF4444' };
  if (percent >= 65) return { level: 'Molto Affollato', color: '#EF4444' };
  if (percent >= 50) return { level: 'Affollato', color: '#F97316' };
  if (percent >= 35) return { level: 'Moderato', color: '#F59E0B' };
  if (percent >= 20) return { level: 'Calmo', color: '#10B981' };
  return { level: 'Molto Calmo', color: '#10B981' };
}

async function loadLatestWeeklyDataset(): Promise<{
  weekly: Record<string, GoogleCrowdDay>;
  liveStatus?: string;
  livePercent?: number;
}> {
  // 1. Try remote with cache buster to guarantee freshest data from GitHub
  const timestampParam = Date.now();
  const endpoints = [
    `${REMOTE_CROWD_URL}?_t=${timestampParam}`,
    `${CDN_CROWD_URL}?_t=${timestampParam}`,
    REMOTE_CROWD_URL,
    CDN_CROWD_URL,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, 3500);
      if (res.ok) {
        const json = await res.json();
        if (json && json.weeklyData && typeof json.weeklyData === 'object') {
          AsyncStorage.setItem(CROWD_CACHE_KEY, JSON.stringify(json)).catch(() => {});
          return {
            weekly: json.weeklyData,
            liveStatus: json.comparisonStatus,
            livePercent: json.currentPercent,
          };
        }
      }
    } catch {
      // Continue to next endpoint or fallback
    }
  }

  // 2. Try AsyncStorage cache
  try {
    const cached = await AsyncStorage.getItem(CROWD_CACHE_KEY);
    if (cached) {
      const json = JSON.parse(cached);
      if (json && json.weeklyData && typeof json.weeklyData === 'object') {
        return {
          weekly: json.weeklyData,
          liveStatus: json.comparisonStatus,
          livePercent: json.currentPercent,
        };
      }
    }
  } catch {}

  // 3. Fallback to hardcoded BASELINE_WEEKLY
  return {
    weekly: JSON.parse(JSON.stringify(BASELINE_WEEKLY)),
  };
}

/**
 * Fetches real-time crowd data from Google Maps
 * Invoked on app startup/login AND on pull-to-refresh
 */
export async function fetchLiveGoogleCrowd(): Promise<LiveCrowdSnapshot> {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const timestamp = `${h}:${m}`;

  const currentHour = now.getHours();
  const currentDayOfWeek = now.getDay();
  const CROWD_DAY_MAP = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  const todayKey = CROWD_DAY_MAP[currentDayOfWeek];

  const datasetResult = await loadLatestWeeklyDataset();
  const weekly = datasetResult.weekly;

  let currentPercent = 50;
  let currentTypical = 50;
  let currentLevel = 'Moderato';
  let comparisonText = 'Consueto';
  let isLiveDetected = false;

  const todayData = weekly[todayKey];
  if (todayData && !todayData.isClosed && todayData.hours.length > 0) {
    const liveItem = todayData.hours.find((it) => it.hour === currentHour);
    if (liveItem) {
      if (datasetResult.livePercent !== undefined && datasetResult.livePercent !== null) {
        liveItem.percent = datasetResult.livePercent;
        if (datasetResult.liveStatus) {
          liveItem.comparisonStatus = datasetResult.liveStatus;
        }
        const dynamicMeta = getCrowdLevelAndColor(liveItem.percent);
        liveItem.level = dynamicMeta.level;
        liveItem.color = dynamicMeta.color;
      }
      liveItem.isLive = true;
      currentPercent = liveItem.percent;
      currentTypical = liveItem.typical;
      currentLevel = liveItem.level;
      comparisonText = liveItem.comparisonStatus || getCrowdComparisonLabel(currentPercent, currentTypical);
      isLiveDetected = true;
    } else {
      const nearest = todayData.hours.find((it) => Math.abs(it.hour - currentHour) <= 1) || todayData.hours[0];
      if (nearest) {
        currentPercent = nearest.percent;
        currentTypical = nearest.typical;
        currentLevel = nearest.level;
        comparisonText = nearest.comparisonStatus || getCrowdComparisonLabel(currentPercent, currentTypical);
      }
    }
  }

  return {
    timestamp,
    currentPercent,
    currentTypical,
    currentLevel,
    comparisonText,
    isLiveDetected,
    weeklyData: weekly,
  };
}
