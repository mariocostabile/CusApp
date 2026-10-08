/**
 * GinniPAL Direct HTTP Service for CUS Cosenza
 * Connects directly to the GinniPAL (Paneura / Heron) ASP.NET endpoints.
 * Handles automatic login, session cookies, profile/reservation extraction,
 * slot booking, and cancellations in real time — both via dev bridge and natively on mobile.
 */

import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';

function getDevServerBaseUrl(): string {
  if (Platform.OS === 'web') {
    return '';
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split('/')[0];
    return `http://${host}`;
  }
  const scriptURL = (NativeModules as any)?.SourceCode?.scriptURL;
  if (scriptURL) {
    try {
      const parsed = new URL(scriptURL);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {}
  }
  return '';
}

export interface DashboardData {
  name: string;
  tessera: string;
  email: string;
  academicYear: string;
  medicalCertExpiry: string;
  medicalCertFitness: string;
  subscription: {
    title: string;
    code: string;
    total: number;
    used: number;
    remaining: number;
    validity: string;
  };
  reservations: Array<{
    id: string;
    title: string;
    code: string;
    quota: string;
    date: string;
    time: string;
    rawText: string;
    bookedAt?: number;
  }>;
}

const DEFAULT_EMAIL = '';
const DEFAULT_PASSWORD = '';

export const FALLBACK_DASHBOARD_DATA: DashboardData = {
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

function decodeHtml(html: string): string {
  return html
    .replace(/&#160;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&#224;/g, 'à')
    .replace(/&#232;/g, 'è')
    .replace(/&#233;/g, 'é')
    .replace(/&#242;/g, 'ò')
    .replace(/&#249;/g, 'ù')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseCookieHeader(existingCookies: string[], setCookieHeader: string | null): string[] {
  if (!setCookieHeader) return existingCookies;

  const cookieMap = new Map<string, string>();
  for (const c of existingCookies) {
    const part = c.split(';')[0].trim();
    const eqIdx = part.indexOf('=');
    if (eqIdx !== -1) {
      cookieMap.set(part.substring(0, eqIdx).trim(), part.substring(eqIdx + 1).trim());
    }
  }

  const incoming = setCookieHeader.split(/,(?=\s*[A-Za-z0-9_.-]+=)/);
  for (const c of incoming) {
    const part = c.split(';')[0].trim();
    const eqIdx = part.indexOf('=');
    if (eqIdx !== -1) {
      cookieMap.set(part.substring(0, eqIdx).trim(), part.substring(eqIdx + 1).trim());
    }
  }

  const result: string[] = [];
  for (const [k, v] of cookieMap.entries()) {
    result.push(`${k}=${v}`);
  }
  return result;
}

interface CookieJar {
  list: string[];
}

const COMMON_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function ginnipalFetch(
  url: string,
  options: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
  } = {},
  jar?: CookieJar
): Promise<{ text: string; status: number; headers: Headers }> {
  const reqHeaders: Record<string, string> = {
    'User-Agent': COMMON_USER_AGENT,
    Accept: '*/*',
    ...(options.headers || {}),
  };

  if (jar && jar.list.length > 0) {
    reqHeaders['Cookie'] = jar.list.join('; ');
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body,
    credentials: 'include',
  });

  if (jar) {
    const rawSetCookie =
      typeof (res.headers as any).getSetCookie === 'function'
        ? (res.headers as any).getSetCookie()
        : res.headers.get('set-cookie');

    if (Array.isArray(rawSetCookie)) {
      for (const sc of rawSetCookie) {
        jar.list = parseCookieHeader(jar.list, sc);
      }
    } else if (typeof rawSetCookie === 'string') {
      jar.list = parseCookieHeader(jar.list, rawSetCookie);
    }
  }

  const text = await res.text();
  return { text, status: res.status, headers: res.headers };
}

/**
 * Executes login and navigates to ExtMain SubForm.
 * Returns subFormKey and initial subControls for further actions or profile parsing.
 */
async function loginAndInitSubForm(
  email: string,
  password: string,
  jar: CookieJar
): Promise<{ subFormKey: string; initControls: any; subInitControls: any }> {
  const cleanEmail = email.trim();
  const cleanPassword = password.trim();

  // Reset cookie jar so we start login with a fresh, unauthenticated session
  jar.list = [];

  // 1. GET AltLogin.aspx with cache-busting to prevent stale session FormKey
  const step1 = await ginnipalFetch(
    `https://ginnipal.it/CusCosenza/AltLogin.aspx?_t=${Date.now()}`,
    {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    },
    jar
  );

  if (step1.status >= 500) {
    throw new Error(`Server GinniPAL temporaneamente non disponibile (HTTP ${step1.status}). Riprova tra poco.`);
  }

  const formKey1Match = step1.text.match(/var FormKey = "([^"]+)";/);
  if (!formKey1Match) {
    if (step1.text.includes('Manutenzione') || step1.text.includes('manutenzione')) {
      throw new Error('Il portale CUS GinniPAL è attualmente in manutenzione.');
    }
    throw new Error('Impossibile caricare il modulo di accesso GinniPAL. Verifica la connessione e riprova.');
  }
  const formKey1 = formKey1Match[1];

  // 2. POST AltLogin.Ajax.ashx/Login
  const postParams = new URLSearchParams({
    FormKey: formKey1,
    Params: JSON.stringify({
      controls: {
        edEmail: { text: cleanEmail, enabled: true, readonly: false },
        edPassword: { text: cleanPassword, enabled: true, readonly: false },
      },
      sender: 'bLogin',
    }),
  }).toString();

  const step2 = await ginnipalFetch(
    'https://ginnipal.it/CusCosenza/AltLogin.Ajax.ashx/Login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: postParams,
    },
    jar
  );

  let loginData: any;
  try {
    loginData = JSON.parse(step2.text);
  } catch {
    throw new Error('Risposta anomala dal server GinniPAL durante il login');
  }

  const redirectPath = loginData.actions?.[0]?.redirect;
  if (!redirectPath) {
    const serverMsg =
      loginData.actions?.[0]?.message ||
      loginData.actions?.[0]?.text ||
      loginData.actions?.[0]?.error;
    throw new Error(serverMsg || 'Email o password non corretti');
  }

  // 3. GET ExtMain.aspx with robust URL normalization
  const rawRedirect = String(redirectPath).trim();
  let step3Url: string;
  if (rawRedirect.startsWith('http://') || rawRedirect.startsWith('https://')) {
    step3Url = rawRedirect.split('#')[0];
  } else {
    const pathNoHash = rawRedirect.split('#')[0].replace(/^\/+/, '');
    const cleanPath = pathNoHash.startsWith('CusCosenza/')
      ? pathNoHash.substring('CusCosenza/'.length)
      : pathNoHash;
    step3Url = `https://ginnipal.it/CusCosenza/${cleanPath || 'ExtMain.aspx'}`;
  }

  const step3 = await ginnipalFetch(step3Url, {}, jar);

  let extMainFormKey = '';
  const extMainFormKeyMatch =
    step3.text.match(/var FormKey = "([^"]+)";/) ||
    step3.text.match(/FormKey\s*=\s*["']([^"']+)["']/i) ||
    rawRedirect.match(/[#&?]FormKey=([^&#]+)/i);

  if (extMainFormKeyMatch) {
    extMainFormKey = extMainFormKeyMatch[1];
  }

  if (!extMainFormKey) {
    // If not found in step3, try fetching ExtMain.aspx directly
    const retryStep3 = await ginnipalFetch('https://ginnipal.it/CusCosenza/ExtMain.aspx', {}, jar);
    const retryMatch =
      retryStep3.text.match(/var FormKey = "([^"]+)";/) ||
      retryStep3.text.match(/FormKey\s*=\s*["']([^"']+)["']/i);
    if (retryMatch) {
      extMainFormKey = retryMatch[1];
    } else {
      if (__DEV__) {
        console.warn('[GinnipalService] Step 3 failed. Status:', step3.status, 'Target:', step3Url);
      }
      throw new Error('Impossibile inizializzare la dashboard CUS GinniPAL');
    }
  }

  // 4. GET ExtMain.Ajax.ashx/Initialize
  const step4 = await ginnipalFetch(
    `https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${extMainFormKey}`,
    {},
    jar
  );
  const subFormMatch = step4.text.match(/formKey=([^&"]+)/);
  if (!subFormMatch) {
    throw new Error('Chiave modulo tesserato non trovata');
  }
  const subFormKey = subFormMatch[1];

  let initControls: any = {};
  try {
    const cleanInitJson = step4.text.replace(/^var initialData\s*=\s*/, '').replace(/;$/, '');
    const parsedInit = JSON.parse(cleanInitJson);
    initControls = parsedInit.actions?.[0]?.controls || {};
  } catch (e) {
    if (__DEV__) {
      console.warn('[GinnipalService] Notice parsing initControls:', e);
    }
  }

  // 5. GET SubForm Initialize
  const step5 = await ginnipalFetch(
    `https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${subFormKey}`,
    {},
    jar
  );

  let subInitControls: any = {};
  try {
    const cleanSubJson = step5.text.replace(/^var initialData\s*=\s*/, '').replace(/;$/, '');
    const parsedSub = JSON.parse(cleanSubJson);
    subInitControls = parsedSub.actions?.[0]?.controls || {};
  } catch (e) {
    if (__DEV__) {
      console.warn('[GinnipalService] Notice parsing subInitControls:', e);
    }
  }

  return { subFormKey, initControls, subInitControls };
}

/**
 * Direct HTTPS profile and reservation scraper.
 */
async function fetchLiveGinnipalDirect(
  email: string,
  password: string,
  existingJar?: CookieJar
): Promise<DashboardData> {
  if (Platform.OS === 'web') {
    return FALLBACK_DASHBOARD_DATA;
  }

  const jar = existingJar || { list: [] };
  const { initControls, subInitControls } = await loginAndInitSubForm(email, password, jar);

  const rawName = initControls.mp_stPersona?.html || subInitControls.mp_stPersona?.html || '';
  const cleanName = rawName ? decodeHtml(rawName).replace(/<[^>]*>/g, '').trim() : '';
  const parsedName = cleanName || 'Tesserato CUS';

  const rawTessera = initControls.mp_stNumeroTessera?.html || subInitControls.mp_stNumeroTessera?.html || '';
  const parsedTessera = rawTessera ? decodeHtml(rawTessera).replace(/<[^>]*>/g, '').trim() : '';

  const rawIscrizioni = decodeHtml(subInitControls.stIscrizioni?.html || '');
  const totMatch = rawIscrizioni.match(/Totale utilizzi:\s*(\d+)/i);
  const usuMatch = rawIscrizioni.match(/Usufruiti:\s*(\d+)/i);
  const rimMatch = rawIscrizioni.match(/Rimanenti:\s*(\d+)/i);
  const valMatch = rawIscrizioni.match(/(dal\s+\d{2}\/\d{2}\/\d{4}\s+al\s+\d{2}\/\d{2}\/\d{4})/i);

  const rawCert = decodeHtml(subInitControls.stDatiCertificatoMedico?.html || '');
  const certExpMatch = rawCert.match(/Scadenza:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const certIdoMatch = rawCert.match(/Idoneit[aà]:\s*([^<]+)/i);

  const reservationHtmls = [subInitControls.stPrenotazioni?.html || ''];
  const rowSuffixes = subInitControls.ctPrenotazioni?.rowSuffixes || [];
  for (const s of rowSuffixes) {
    if (subInitControls['stPrenotazione-' + s]?.html) {
      reservationHtmls.push(subInitControls['stPrenotazione-' + s].html);
    }
  }
  for (const k of Object.keys(subInitControls)) {
    if (k.startsWith('stPrenotazione-') && !reservationHtmls.includes(subInitControls[k]?.html)) {
      reservationHtmls.push(subInitControls[k].html);
    }
  }

  const combinedPrenotazioni = decodeHtml(reservationHtmls.join('\n'));
  const reservations: DashboardData['reservations'] = [];
  const pRegex =
    /Prenotazione n\.\s*(\d+)\s*per il giorno\s*(\d{2}\/\d{2}\/\d{4})\s*dalle\s*([\d:]+)\s*alle\s*([\d:]+)/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(combinedPrenotazioni)) !== null) {
    reservations.push({
      id: pMatch[1],
      title: 'Palestra body building',
      code: 'BB',
      quota: 'TURNO',
      date: pMatch[2],
      time: `${pMatch[3]} - ${pMatch[4]}`,
      rawText: pMatch[0],
    });
  }

  const liveData: DashboardData = {
    name: parsedName,
    tessera: parsedTessera,
    email: email.trim(),
    academicYear: '2026/2027',
    medicalCertExpiry: certExpMatch ? certExpMatch[1] : '',
    medicalCertFitness: certIdoMatch ? certIdoMatch[1].trim() : 'In regola',
    subscription: {
      title: 'Body Building',
      code: 'BB',
      total: totMatch ? parseInt(totMatch[1], 10) : 0,
      used: usuMatch ? parseInt(usuMatch[1], 10) : 0,
      remaining: rimMatch ? parseInt(rimMatch[1], 10) : 0,
      validity: valMatch ? valMatch[1] : '',
    },
    reservations,
  };

  if (__DEV__) {
    console.log('[GinnipalService] Live data fetched directly:', {
      name: liveData.name,
      used: liveData.subscription.used,
      remaining: liveData.subscription.remaining,
      reservationsCount: liveData.reservations.length,
    });
  }

  return liveData;
}

/**
 * Direct HTTPS booking execution from mobile.
 */
async function bookLiveReservationDirect(
  email: string,
  password: string,
  dateStr: string,
  timeSlot: string
): Promise<DashboardData> {
  const dateParts = dateStr.split('/');
  const targetDateIso =
    dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : dateStr;

  const jar: CookieJar = { list: [] };
  const { subFormKey } = await loginAndInitSubForm(email, password, jar);

  // 6. Prenotazione (Open Elenco Corsi)
  const prenPayload = new URLSearchParams({
    FormKey: subFormKey,
    Params: JSON.stringify({ controls: {}, sender: 'bPrenotazione' }),
  }).toString();

  const prenRes = await ginnipalFetch(
    'https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Prenotazione',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: prenPayload,
    },
    jar
  );

  const prenData = JSON.parse(prenRes.text);
  const corsiUrl = prenData.actions?.[0]?.navigate?.url;
  if (!corsiUrl) throw new Error("Impossibile accedere all'elenco dei corsi");
  const corsiSubKey = corsiUrl.match(/formKey=([^&]+)/)[1];

  // 7. Initialize Elenco Corsi
  await ginnipalFetch(
    `https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${corsiSubKey}`,
    {},
    jar
  );

  // 8. Dettagli-1 (Open Body Building booking modal)
  const dettPayload = new URLSearchParams({
    FormKey: corsiSubKey,
    Params: JSON.stringify({ controls: {}, sender: 'bDettagli-1' }),
  }).toString();

  const dettRes = await ginnipalFetch(
    'https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Dettagli',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: dettPayload,
    },
    jar
  );

  const dettData = JSON.parse(dettRes.text);
  const iscrizioneUrl = dettData.actions?.[0]?.navigate?.url;
  if (!iscrizioneUrl) throw new Error('Modulo di prenotazione non disponibile');
  const iscrizioneSubKey = iscrizioneUrl.match(/formKey=([^&]+)/)[1];

  // 9. Initialize booking form
  await ginnipalFetch(
    `https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${iscrizioneSubKey}`,
    {},
    jar
  );

  // 10. DataPrenotataChanged
  const dateChangePayload = new URLSearchParams({
    FormKey: iscrizioneSubKey,
    Params: JSON.stringify({
      sender: 'edDataPrenotata',
      changedControl: 'edDataPrenotata',
      controls: {
        edQuota: { value: 'TURNO', enabled: true },
        edDataPrenotata: { date: targetDateIso, enabled: true, readonly: false },
        edOrarioPrenotato: { value: '-1', enabled: true },
      },
    }),
  }).toString();

  const dateChangeRes = await ginnipalFetch(
    'https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/DataPrenotataChanged',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: dateChangePayload,
    },
    jar
  );

  const dateChangeData = JSON.parse(dateChangeRes.text);
  const slotItems = dateChangeData.actions?.[0]?.controls?.edOrarioPrenotato?.items || [];

  let matchedSlot = slotItems.find(
    (item: any) =>
      item.label &&
      (item.label.trim() === timeSlot.trim() ||
        item.label.startsWith(timeSlot.split(' - ')[0]))
  );
  if (!matchedSlot && slotItems.length > 0) {
    matchedSlot = slotItems.find((item: any) => item.value !== '-1' && item.label);
  }

  if (!matchedSlot || matchedSlot.value === '-1') {
    throw new Error(
      `Orario ${timeSlot} non disponibile per il ${dateStr} (posti esauriti o turno non attivo)`
    );
  }

  // 11. OrarioPrenotatoChanged
  const slotChangePayload = new URLSearchParams({
    FormKey: iscrizioneSubKey,
    Params: JSON.stringify({
      sender: 'edOrarioPrenotato',
      changedControl: 'edOrarioPrenotato',
      controls: {
        edQuota: { value: 'TURNO', enabled: true },
        edDataPrenotata: { date: targetDateIso, enabled: true, readonly: false },
        edOrarioPrenotato: { value: matchedSlot.value, enabled: true },
      },
    }),
  }).toString();

  await ginnipalFetch(
    'https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/OrarioPrenotatoChanged',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: slotChangePayload,
    },
    jar
  );

  // 12. Procedi
  const procediPayload = new URLSearchParams({
    FormKey: iscrizioneSubKey,
    Params: JSON.stringify({
      sender: 'bProcedi',
      controls: {
        edQuota: { value: 'TURNO', enabled: true },
        edDataPrenotata: { date: targetDateIso, enabled: true, readonly: false },
        edOrarioPrenotato: { value: matchedSlot.value, enabled: true },
      },
    }),
  }).toString();

  const procediRes = await ginnipalFetch(
    'https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Procedi',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: procediPayload,
    },
    jar
  );

  const procediData = JSON.parse(procediRes.text);
  const riepilogoUrl = procediData.actions?.[0]?.navigate?.url;
  if (!riepilogoUrl) {
    const errorMsg =
      procediData.actions?.[0]?.message ||
      procediData.actions?.[0]?.text ||
      "Impossibile procedere al riepilogo dell'ordine";
    throw new Error(errorMsg);
  }
  const riepilogoSubKey = riepilogoUrl.match(/formKey=([^&]+)/)[1];

  // 13. Initialize Riepilogo
  await ginnipalFetch(
    `https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${riepilogoSubKey}`,
    {},
    jar
  );

  // 14. Conferma
  const confermaPayload = new URLSearchParams({
    FormKey: riepilogoSubKey,
    Params: JSON.stringify({
      sender: 'bConferma',
      controls: {},
    }),
  }).toString();

  const confermaRes = await ginnipalFetch(
    'https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Conferma',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: confermaPayload,
    },
    jar
  );

  try {
    const confermaData = JSON.parse(confermaRes.text);
    const alertMsg =
      confermaData.actions?.[0]?.message ||
      confermaData.actions?.[0]?.error ||
      confermaData.actions?.[0]?.text;
    if (alertMsg && !confermaData.actions?.[0]?.redirect && !confermaData.actions?.[0]?.navigate) {
      throw new Error(alertMsg);
    }

    const redirectUrl =
      confermaData.actions?.[0]?.redirect || confermaData.actions?.[0]?.navigate?.url || '';
    if (redirectUrl) {
      const urlBeforeHash = redirectUrl.split('#')[0];
      await ginnipalFetch(`https://ginnipal.it/CusCosenza/${urlBeforeHash}`, {}, jar);

      const subKeyMatch = redirectUrl.match(/[#&]formKey=([^&#]+)/i);
      const mainKeyMatch = redirectUrl.match(/FormKey=([^&#]+)/i);
      const esitoSubKey = subKeyMatch
        ? subKeyMatch[1]
        : mainKeyMatch
        ? mainKeyMatch[1]
        : null;

      if (esitoSubKey) {
        await ginnipalFetch(
          `https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${esitoSubKey}`,
          {},
          jar
        );
      }
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('JSON')) {
      throw err;
    }
    if (__DEV__) {
      console.log('[GinnipalService] Notice on EsitoPagamento:', err?.message);
    }
  }

  // 15. Return fresh profile data with updated reservation count
  return await fetchLiveGinnipalDirect(email, password, jar);
}

/**
 * Direct HTTPS cancellation execution from mobile.
 */
async function cancelLiveReservationDirect(
  email: string,
  password: string,
  reservationId: string
): Promise<DashboardData> {
  const jar: CookieJar = { list: [] };
  const { subFormKey, subInitControls } = await loginAndInitSubForm(email, password, jar);

  let targetSuffix = '1';
  const rowSuffixes = subInitControls.ctPrenotazioni?.rowSuffixes || ['1'];
  for (const s of rowSuffixes) {
    const rowHtml = subInitControls['stPrenotazione-' + s]?.html || '';
    if (reservationId && rowHtml.includes(reservationId)) {
      targetSuffix = s;
      break;
    }
  }

  // AnnullaPrenotazione request
  const cancelPayload = new URLSearchParams({
    FormKey: subFormKey,
    Params: JSON.stringify({
      sender: `bAnnullaPrenotazione-${targetSuffix}`,
      controls: {},
    }),
  }).toString();

  const cancelRes = await ginnipalFetch(
    'https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/AnnullaPrenotazione',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: cancelPayload,
    },
    jar
  );

  // ConfirmAlert if requested by GinniPAL
  try {
    const cancelData = JSON.parse(cancelRes.text);
    const alert = cancelData.actions?.[0]?.confirmAlert;
    if (alert && alert.yesCommand) {
      const confirmPayload = new URLSearchParams({
        FormKey: subFormKey,
        Params: JSON.stringify({
          sender: `bAnnullaPrenotazione-${targetSuffix}`,
          userResponses: {
            [alert.name || 'ConfermaAnnullamentoPrenotazione']: {
              promptType: 'confirmAlert',
              value: 'yes',
            },
          },
          controls: {},
        }),
      }).toString();

      await ginnipalFetch(
        `https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/${alert.yesCommand}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: confirmPayload,
        },
        jar
      );
    }
  } catch (err: any) {
    if (__DEV__) {
      console.log('[GinnipalService] Notice on cancel confirm:', err?.message);
    }
  }

  return await fetchLiveGinnipalDirect(email, password, jar);
}

/**
 * Fetches real-time dashboard data directly from the GinniPAL servers.
 * Tries dev bridge first if active, otherwise runs direct HTTPS requests.
 */
export async function fetchLiveGinnipalData(
  email: string = DEFAULT_EMAIL,
  password: string = DEFAULT_PASSWORD
): Promise<DashboardData> {
  const devOrigin = getDevServerBaseUrl();
  if (devOrigin) {
    try {
      const proxyRes = await fetch(`${devOrigin}/api/ginnipal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (proxyRes.ok) {
        const data = await proxyRes.json();
        if (data && data.name) {
          if (__DEV__) {
            console.log('[GinnipalService] Live data fetched via bridge:', {
              name: data.name,
              used: data.subscription?.used,
              remaining: data.subscription?.remaining,
            });
          }
          return data as DashboardData;
        }
      }
    } catch {
      // Continue to direct mobile request
    }
  }

  return await fetchLiveGinnipalDirect(email, password);
}

/**
 * Books a real slot directly on GinniPAL servers.
 * Works natively in standalone APK and via Metro dev bridge.
 */
export async function bookLiveReservation(
  email: string = DEFAULT_EMAIL,
  password: string = DEFAULT_PASSWORD,
  date: string = '',
  slot: string = ''
): Promise<DashboardData> {
  const devOrigin = getDevServerBaseUrl();
  if (devOrigin) {
    try {
      const res = await fetch(`${devOrigin}/api/ginnipal/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, date, slot }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.name) {
          return data as DashboardData;
        }
      }
    } catch {
      // Fall through to direct mobile booking
    }
  }

  return await bookLiveReservationDirect(email, password, date, slot);
}

/**
 * Cancels a real reservation on GinniPAL servers.
 * Works natively in standalone APK and via Metro dev bridge.
 */
export async function cancelLiveReservation(
  email: string = DEFAULT_EMAIL,
  password: string = DEFAULT_PASSWORD,
  reservationId: string = ''
): Promise<DashboardData> {
  const devOrigin = getDevServerBaseUrl();
  if (devOrigin) {
    try {
      const res = await fetch(`${devOrigin}/api/ginnipal/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, id: reservationId, reservationId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.name) {
          return data as DashboardData;
        }
      }
    } catch {
      // Fall through to direct mobile cancellation
    }
  }

  return await cancelLiveReservationDirect(email, password, reservationId);
}
