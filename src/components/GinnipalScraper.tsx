import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import WebView from 'react-native-webview';
import { View } from 'react-native';

export type ScraperState = 'idle' | 'logging_in' | 'logged_in' | 'fetching_dashboard' | 'booking' | 'cancelling' | 'error';

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

interface GinnipalScraperProps {
  onLoginSuccess: () => void;
  onLoginError: (error: string) => void;
  onDashboardData: (data: DashboardData) => void;
  onBookingSuccess: (msg?: string) => void;
  onBookingError: (error: string) => void;
  onCancelSuccess: () => void;
  onCancelError: (error: string) => void;
}

export interface GinnipalScraperRef {
  login: (email: string, pass: string) => void;
  fetchDashboard: () => void;
  bookSlot: (date: string, timeSlot: string) => void;
  cancelBooking: () => void;
}

export const GinnipalScraper = forwardRef<GinnipalScraperRef, GinnipalScraperProps>(({
  onLoginSuccess,
  onLoginError,
  onDashboardData,
  onBookingSuccess,
  onBookingError,
  onCancelSuccess,
  onCancelError,
}, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState('https://ginnipal.it/CusCosenza/AltLogin.aspx');
  const [scraperState, setScraperState] = useState<ScraperState>('idle');
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [pendingBooking, setPendingBooking] = useState<{ date: string; timeSlot: string } | null>(null);

  useImperativeHandle(ref, () => ({
    login: (email, pass) => {
      setCredentials({ email, password: pass });
      setScraperState('logging_in');
      setCurrentUrl('https://ginnipal.it/CusCosenza/AltLogin.aspx');
      webViewRef.current?.reload();
    },
    fetchDashboard: () => {
      setScraperState('fetching_dashboard');
      setCurrentUrl('https://ginnipal.it/CusCosenza/ExtMain.aspx?baseUrl=ExtHome');
    },
    bookSlot: (date, timeSlot) => {
      setPendingBooking({ date, timeSlot });
      setScraperState('booking');
      setCurrentUrl('https://ginnipal.it/CusCosenza/ExtMain.aspx?baseUrl=ElencoCorsi');
    },
    cancelBooking: () => {
      setScraperState('cancelling');
      const cancelScript = `
        (function() {
          const cancelBtn = document.querySelector('#bAnnullaPrenotazione-1');
          if (cancelBtn) {
            cancelBtn.click();
            setTimeout(() => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CANCEL_SUCCESS' }));
            }, 1000);
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CANCEL_ERROR', message: 'Pulsante annulla non trovato' }));
          }
        })();
        true;
      `;
      webViewRef.current?.injectJavaScript(cancelScript);
    }
  }));

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (__DEV__) {
        console.log('[Scraper Message]:', data.type);
      }
      
      switch (data.type) {
        case 'LOGIN_SUCCESS':
          setScraperState('logged_in');
          onLoginSuccess();
          break;
        case 'LOGIN_ERROR':
          setScraperState('error');
          onLoginError(data.message || 'Credenziali non valide');
          break;
        case 'DASHBOARD_DATA':
          onDashboardData(data.payload);
          break;
        case 'BOOKING_SUCCESS':
          setScraperState('logged_in');
          onBookingSuccess(data.message);
          break;
        case 'BOOKING_ERROR':
          setScraperState('error');
          onBookingError(data.message || 'Errore durante la prenotazione');
          break;
        case 'CANCEL_SUCCESS':
          onCancelSuccess();
          break;
        case 'CANCEL_ERROR':
          onCancelError(data.message);
          break;
      }
    } catch (e) {
      if (__DEV__) {
        console.log('Error parsing webview message:', e);
      }
    }
  };

  const executeLoginScript = `
    (function() {
      setTimeout(function() {
        if (document.body.innerText.includes('Utente Collegato:')) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOGIN_SUCCESS' }));
          return;
        }
        const errElem = document.querySelector('.alert-danger, #stErrore');
        if (errElem && errElem.innerText.trim()) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOGIN_ERROR', message: errElem.innerText.trim() }));
          return;
        }

        const emailField = document.querySelector('#edEmail');
        const passField = document.querySelector('#edPassword');
        const loginBtn = document.querySelector('#bLogin');
        
        if (emailField && passField && loginBtn) {
          emailField.value = ${JSON.stringify(credentials.email)};
          passField.value = ${JSON.stringify(credentials.password)};
          loginBtn.click();
        }
      }, 800);
    })();
    true;
  `;

  const executeExtractDashboard = `
    (function() {
      setTimeout(function() {
        try {
          const bodyText = document.body.innerText;
          const name = document.querySelector('#mp_stPersona')?.innerText?.trim() || 'Tesserato CUS';
          const tessera = document.querySelector('#mp_stNumeroTessera')?.innerText?.trim() || '';
          const email = document.querySelector('#mp_stEmail')?.innerText?.trim() || '';
          
          const certMatch = bodyText.match(/Scadenza:\\s*(\\d{2}\\/\\d{2}\\/\\d{4})/i) || bodyText.match(/(\\d{2}\\/\\d{2}\\/\\d{4})/);
          const expiry = certMatch ? certMatch[1] : '';

          // Parse Subscriptions
          const totMatch = bodyText.match(/Totale utilizzi:\\s*(\\d+)/i);
          const usuMatch = bodyText.match(/Usufruiti:\\s*(\\d+)/i);
          const rimMatch = bodyText.match(/Rimanenti:\\s*(\\d+)/i);

          const subscription = {
            title: 'Body Building',
            code: 'BB',
            total: totMatch ? parseInt(totMatch[1], 10) : 0,
            used: usuMatch ? parseInt(usuMatch[1], 10) : 0,
            remaining: rimMatch ? parseInt(rimMatch[1], 10) : 0,
            validity: ''
          };

          // Parse Reservations
          const reservations = [];
          if (bodyText.includes('Prenotazione n.')) {
            const pMatch = bodyText.match(/Prenotazione n\\.\\s*(\\d+)\\s*per il giorno\\s*(\\d{2}\\/\\d{2}\\/\\d{4})\\s*dalle\\s*([\\d:]+)\\s*alle\\s*([\\d:]+)/i);
            if (pMatch) {
              reservations.push({
                id: pMatch[1],
                title: 'Palestra body building',
                code: 'BB',
                quota: 'TURNO',
                date: pMatch[2],
                time: pMatch[3] + ' - ' + pMatch[4],
                rawText: pMatch[0]
              });
            }
          }

          const payload = {
            name,
            tessera,
            email,
            academicYear: '2026/2027',
            medicalCertExpiry: expiry,
            medicalCertFitness: 'NON AGONISTICA',
            subscription,
            reservations
          };

          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DASHBOARD_DATA', payload }));
        } catch (err) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DASHBOARD_DATA', payload: null, error: err.toString() }));
        }
      }, 1500);
    })();
    true;
  `;

  const executeBookingStep = `
    (function() {
      setTimeout(function() {
        const url = window.location.href;
        if (url.includes('ElencoCorsi')) {
          // In list of courses, click "Vedi e prenota" for BB
          const bookBtn = document.querySelector('#bDettagli-1');
          if (bookBtn) {
            bookBtn.click();
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'BOOKING_ERROR', message: 'Corso Body Building non trovato nell\\'elenco' }));
          }
        } else if (url.includes('IscrizioneACorso')) {
          // Select quota, date and time
          const proceedBtn = document.querySelector('#bProcedi');
          const quotaSelect = document.querySelector('#edQuota');
          const dateInput = document.querySelector('#edDataPrenotata');
          const timeSelect = document.querySelector('#edOrarioPrenotato');

          if (dateInput && ${JSON.stringify(pendingBooking?.date || '')}) {
            dateInput.value = ${JSON.stringify(pendingBooking?.date || '')};
          }

          if (proceedBtn) {
            // Confirm booking
            proceedBtn.click();
            setTimeout(function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'BOOKING_SUCCESS', message: 'Prenotazione effettuata con successo!' }));
            }, 1500);
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'BOOKING_ERROR', message: 'Modulo di prenotazione non pronto' }));
          }
        }
      }, 1200);
    })();
    true;
  `;

  const injectScript = (navState: any) => {
    const url = navState?.url || navState?.nativeEvent?.url || '';
    if (url.includes('ExtMain.aspx') && scraperState === 'logging_in') {
      setScraperState('logged_in');
      onLoginSuccess();
    } else if (scraperState === 'logging_in') {
      webViewRef.current?.injectJavaScript(executeLoginScript);
    } else if (scraperState === 'fetching_dashboard') {
      webViewRef.current?.injectJavaScript(executeExtractDashboard);
    } else if (scraperState === 'booking') {
      webViewRef.current?.injectJavaScript(executeBookingStep);
    }
  };

  return (
    <View style={{ height: 1, width: 1, opacity: 0, position: 'absolute' }}>
      {/* @ts-ignore */}
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        onNavigationStateChange={injectScript}
        onLoadEnd={injectScript}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
      />
    </View>
  );
});
