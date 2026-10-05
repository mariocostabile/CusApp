# CusApp — CUS Cosenza & Unical Companion 🏋️‍♂️🎓

<div align="center">

![Expo SDK](https://img.shields.io/badge/Expo-SDK%2057-000020?style=for-the-badge&logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)

<p align="center">
  <strong>Client mobile moderno, intuitivo e non ufficiale per la gestione delle attività, prenotazione turni e monitoraggio in tempo reale dell'affluenza per il CUS Cosenza (Università della Calabria).</strong>
</p>

</div>

---

## 📖 Indice

- [Panoramica](#-panoramica)
- [Funzionalità Chiave](#-funzionalità-chiave)
- [Architettura & Integrazione GinniPAL](#-architettura--integrazione-ginnipal)
- [Monitoraggio Affluenza Sala Pesi (Crowd Analytics)](#-monitoraggio-affluenza-sala-pesi-crowd-analytics)
- [Regole di Business CUS Cosenza](#-regole-di-business-cus-cosenza)
- [Stack Tecnologico](#-stack-tecnologico)
- [Struttura del Progetto](#-struttura-del-progetto)
- [Prerequisiti & Installazione](#-prerequisiti--installazione)
- [Esecuzione e Sviluppo](#-esecuzione-e-sviluppo)
- [🏗️ Build & Distribuzione](#-build--distribuzione)
- [Disclaimer & Note Legali](#-disclaimer--note-legali)
- [Autore](#-autore)

---

## 🌟 Panoramica

**CusApp** nasce per superare le limitazioni di fruibilità dell'interfaccia web del portale GinniPAL del **CUS Cosenza**, offrendo a studenti e tesserati dell'**Università della Calabria (Unical)** un'applicazione mobile nativa veloce, moderna ed elegante.

L'applicazione trasforma la gestione delle prenotazioni della palestra in un'esperienza istantanea: consente l'accesso rapido al proprio profilo, visualizza gli ingressi residui dell'abbonamento, automatizza la prenotazione dei turni secondo le finestre orarie ufficiali, fornisce un countdown dinamico per la cancellazione e integra un sistema di monitoraggio live dell'affluenza basato su dati statistici e in tempo reale di Google Maps.

---

## ⚡ Funzionalità Chiave

### 🪪 1. Profilo Utente & Stato Abbonamento
- **Dati Tesserato**: Visualizzazione chiara di Nome, Cognome, Email, Numero di Tessera e Anno Sportivo Accademico.
- **Certificato Medico**: Monitoraggio della data di scadenza e stato di validità (es. *Non Agonistica* / *Valido*).
- **Bilancio Ingressi**: Contatore in tempo reale degli ingressi usufruiti, ingressi rimanenti e totale disponibile, con periodo di validità dell'abbonamento attivo (Body Building).
- **Convenzione Studentesca Unical**: Riferimento rapido ai dati universitari (Dipartimento, Matricola).

### 📅 2. Prenotazione Intelligente Turni (Body Building)
- **Selezione Data Flessibile**: Riconoscimento automatico delle giornate prenotabili conformi alle policy del portale (finestra attiva limitata a *Oggi* e *Domani*).
- **Filtro Orario Dinamico**: I turni già trascorsi o in corso durante la giornata corrente vengono automaticamente disabilitati.
- **Supporto Orari Speciali**:
  - **Lunedì – Venerdì**: 6 turni da 2 ore ciascuno (dalle 10:00 alle 22:00).
  - **Sabato**: 2 turni mattutini (10:00 - 12:00 e 12:00 - 14:00), con segnalazione di chiusura pomeridiana e serale.
  - **Domenica**: Centro sportivo chiuso con indicazione del prossimo turno utile del lunedì.
- **Stima Affluenza per Turno**: Badge con livello di occupazione previsto per fascia oraria (*Calmo*, *Moderato*, *Alta Richiesta*).

### ⏱️ 3. Gestione Prenotazioni & Countdown Disdetta
- **Elenco Prenotazioni Attive**: Dettaglio di codice turno, data, orario e ID prenotazione univoco assegnato dal sistema.
- **Timer Dinamico al Secondo**: Countdown in tempo reale che calcola il tempo esatto rimasto per poter annullare la prenotazione.
- **Regola Rigorosa delle Disdette**: La cancellazione è permessa **tassativamente fino a 1 ora prima** dell'inizio del turno. Se il tempo scade, la prenotazione viene bloccata e compare il badge di termine scaduto.
- **Annullamento con un Tap**: Cancellazione immediata tramite chiamata ai servizi GinniPAL e riaccredito istantaneo dell'ingresso nel saldo utente.

### 📊 4. Monitoraggio Affluenza Sala Pesi (Crowd Analytics)
- **Dati Live & Tipici**: Integrazione con Google Maps Popular Times per la palestra CUS Unical.
- **Badge Live & Aggiornamento Orario**: Rilevamento in tempo reale della percentuale di occupazione rispetto alla media tipica.
- **Confronto Verbale Intelligente**: Notifiche semantiche (*"Consueto"*, *"Più affollato del solito"*, *"Meno affollato del solito"*).
- **Grafico a Barre Orario Interattivo**: Visualizzazione intuitiva ora per ora (10:00 - 22:00) con doppio livello (livello abituale vs livello attuale).

### 🔄 5. Sincronizzazione in Tempo Reale & Cache Intelligente
- **Auto-Sync all'avvio**: Sincronizzazione trasparente in background di credenziali, abbonamento, prenotazioni e affluenza.
- **Pull to Refresh**: Aggiornamento manuale con scorrimento verso il basso.

---

## 🏛️ Architettura & Integrazione GinniPAL

Il sistema GinniPAL CUS Cosenza si basa su un'architettura monolitica ASP.NET Web Forms legacy protetta da `__VIEWSTATE`, `__EVENTVALIDATION` e cookie di sessione dinamici (`ASP.NET_SessionId`).

CusApp implementa un'architettura a due livelli:

```
┌────────────────────────────────────────────────────────┐
│                   CusApp (Client)                      │
│            React Native / Expo SDK 57                  │
└──────────────────────────┬─────────────────────────────┘
                           │ Chiamate HTTP / Proxy
                           ▼
┌────────────────────────────────────────────────────────┐
│            Metro Middleware & Node Fetcher             │
│  - Endpoint Proxy: /api/ginnipal                       │
│  - Gestione Sessioni, Cookie Jar & ViewState Parsing    │
└──────────────────────────┬─────────────────────────────┘
                           │ Richieste Dirette HTTPS
                           ▼
┌────────────────────────────────────────────────────────┐
│          Portale GinniPAL CUS Cosenza (ASP.NET)        │
│  - AltLogin.aspx                                       │
│  - PrenotaAttivita.aspx                                │
│  - CancellaPrenotazione.aspx                           │
└────────────────────────────────────────────────────────┘
```

1. **`ginnipalNodeFetcher.js`**:
   - Esegue la pipeline di autenticazione multipart/form-urlencoded estraendo token CSRF e parametri ASP.NET.
   - Gestisce la sessione autenticata e il parsing semantico della dashboard, della tabella abbonamenti e delle prenotazioni esistenti.
   - Effettua la sottomissione dei comandi di prenotazione turno e cancellazione con validazione della risposta del server.
2. **Proxy Metro (`metro.config.js`)**:
   - Fornisce middleware integrato per instradare le richieste API durante lo sviluppo ed evitare problemi di CORS o restrizioni SSL/cookie sui dispositivi mobili.
3. **Scraper Fallback (`GinnipalScraper.tsx`)**:
   - WebView invisibile integrata come meccanismo alternativo di scraping resiliente nel caso di variazioni dei formati ASP.NET.

---

## 📊 Monitoraggio Affluenza Sala Pesi (Crowd Analytics)

Il modulo di Crowd Analytics integra una pipeline serverless a costo zero per monitorare in tempo reale l'affluenza della sala pesi senza dipendere da costose API proprietarie o server backend dedicati:

| Giorno | Orario di Apertura | Dati Live Google | Note |
| :--- | :--- | :---: | :--- |
| **Lunedì – Venerdì** | 10:00 – 22:00 | ✅ Attivi | Picco tipico: 18:00 – 20:30. Fasce consigliate: 10:00 – 15:00. |
| **Sabato** | 10:00 – 14:00 | ℹ️ Orario speciale | Due turni mattutini. Pomeriggio e sera chiuso. Nessuna falsa stima. |
| **Domenica** | Chiuso | 🏖️ Non attivi | Segnalazione chiusura con indicazione riapertura lunedì ore 10:00. |

### 🤖 Pipeline di Sincronizzazione Automatica (GitHub Actions + Headless Bot)

```
┌────────────────────────────────────────────────────────┐
│     GitHub Actions Cron Bot (Ogni 30 min, Lun-Ven)     │
│             .github/workflows/sync-crowd.yml           │
└──────────────────────────┬─────────────────────────────┘
                           │ Esegue browser headless
                           ▼
┌────────────────────────────────────────────────────────┐
│             Headless Puppeteer Scraper                 │
│            scripts/sync-google-crowd.js                │
│  - Naviga su Google Maps per il punto d'interesse CUS  │
│  - Estrae percentuali e descrittori dai tag aria-label  │
└──────────────────────────┬─────────────────────────────┘
                           │ Commit & Push automatico
                           ▼
┌────────────────────────────────────────────────────────┐
│            Dataset su Repository Git                   │
│                 crowd_live.json                        │
└──────────────────────────┬─────────────────────────────┘
                           │ CDN Raw GitHub (Cache-Busting)
                           ▼
┌────────────────────────────────────────────────────────┐
│                  CusApp (Client Mobile)                │
│             src/services/googleCrowdService.ts         │
│  - Caching locale AsyncStorage (@cusapp_crowd_data)    │
│  - Resilienza offline con fallback su curve calibrate   │
└────────────────────────────────────────────────────────┘
```

1. **Scraping Headless Intelligente**: Uno script Node.js ([sync-google-crowd.js](scripts/sync-google-crowd.js)) sfrutta l'albero di accessibilità del DOM di Google Maps (`[aria-label]`) per leggere lo stato in tempo reale (percentuale live di affollamento, status semantico rispetto al consueto).
2. **Automazione CI/CD**: Il workflow [sync-crowd.yml](.github/workflows/sync-crowd.yml) gira ogni 30 minuti durante gli orari di apertura della palestra, aggiornando [crowd_live.json](crowd_live.json) in modo completamente autonomo.
3. **Resilienza e Performance Client**: L'app scarica il dataset tramite endpoint GitHub Raw con parametro anti-cache, salva il risultato in `AsyncStorage` locale per il funzionamento offline e dispone di un fallback integrato con curve storiche calibrate per ogni giorno della settimana.

---

## 📐 Regole di Business CUS Cosenza

L'applicazione rispetta fedelmente le policy e i vincoli imposti dal centro sportivo:

1. **Finestra di Prenotazione**: È possibile prenotare turni per la giornata odierna (**Oggi**) e per il giorno successivo (**Domani**).
   - **Sabato**: prenotazioni consentite unicamente per i due turni del sabato mattina (10:00 - 14:00). Il portale CUS apre le prenotazioni per la settimana successiva (lunedì) a partire da **Domenica**.
   - **Domenica**: struttura chiusa; è attiva la prenotazione anticipata per la giornata di Lunedì.
2. **Turni e Validità Oraria**: Non è consentito prenotare turni il cui orario di inizio sia già trascorso o in corso. Se per una giornata non ci sono turni disponibili, il riepilogo mantiene i valori neutri senza forzare selezioni errate.
3. **Disdetta Turni**: La cancellazione della prenotazione è permessa **tassativamente fino a 1 ora prima dell'inizio del turno** (es. per il turno 18:00 - 20:00, la deadline è alle 17:00).
4. **Auto-Rimozione a Fine Turno**: Superata l'ora di conclusione del turno prenotato, la pillola e la card della prenotazione vengono rimosse automaticamente dalla bacheca in tempo reale.
5. **Accesso e Tornelli**: La prenotazione riserva il posto; l'ingresso viene scalato elettronicamente al passaggio della tessera presso i tornelli della struttura.

---

## 🛠️ Stack Tecnologico

- **Core Framework**: [React Native 0.86.3](https://reactnative.dev/)
- **Application Platform**: [Expo SDK 57](https://expo.dev/)
- **Routing**: [Expo Router v4](https://docs.expo.dev/router/introduction/) (File-based Routing)
- **Linguaggio**: [TypeScript 5.x](https://www.typescriptlang.org/)
- **UI & Animations**: React Native Animated & Reanimated
- **Webview & Networking**: `react-native-webview`, Node.js HTTPS client con proxy Metro
- **Safe Area & Gestures**: `react-native-safe-area-context`, `react-native-gesture-handler`

---

## 📁 Struttura del Progetto

```
CusApp/
├── .github/
│   └── workflows/
│       └── sync-crowd.yml       # Workflow CI/CD per aggiornamento automatico affluenza
├── assets/                      # Icone, splash screen e asset grafici
│   └── images/
├── scripts/                     # Script di automazione e manutenzione
│   └── sync-google-crowd.js     # Bot Puppeteer per scraping headless Google Maps
├── src/
│   ├── app/                     # Pagine e percorsi gestiti da Expo Router
│   │   ├── _layout.tsx          # Root layout e configurazione navigazione
│   │   └── index.tsx            # Schermata principale (Dashboard, Turni, Affluenza, Disdette)
│   ├── components/              # Componenti modulari dell'interfaccia
│   │   ├── GinnipalScraper.tsx  # Componente WebView per scraping di fallback
│   │   ├── animated-icon.tsx    # Icone animate con Reanimated
│   │   └── ...
│   ├── constants/               # Costanti dell'app, temi e colori
│   ├── hooks/                   # Custom hooks per stato e lifecycle
│   └── services/                # Logica applicativa e comunicazione backend
│       ├── ginnipalNodeFetcher.js # Driver HTTP nativo per scraping e azioni GinniPAL
│       ├── ginnipalService.ts     # Client bridge per chiamate dirette/proxy
│       └── googleCrowdService.ts  # Servizio analitico affluenza Google Maps con caching
├── app.json                     # Configurazione dell'applicazione Expo (icon, splash, permissions)
├── crowd_live.json              # Dataset JSON affluenza live e curve storiche settimanali
├── metro.config.js              # Configurazione Metro Bundler con proxy API GinniPAL
├── package.json                 # Dipendenze e script npm
└── tsconfig.json                # Configurazione del compilatore TypeScript
```

---

## 📋 Prerequisiti & Installazione

### Prerequisiti

- [Node.js](https://nodejs.org/) (versione 18 o superiore consigliata)
- [npm](https://www.npmjs.com/) o [bun](https://bun.sh/)
- Per test su dispositivo fisico: applicazione **Expo Go** ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) / [iOS](https://apps.apple.com/app/expo-go/id982107779)) oppure un Development Build.

### Installazione

1. Clona il repository:
   ```bash
   git clone https://github.com/mariocostabile/CusApp.git
   cd CusApp
   ```

2. Installa le dipendenze:
   ```bash
   npm install
   ```

3. Configura le variabili d'ambiente (facoltativo per login rapido in sviluppo):
   ```bash
   cp .env.example .env
   ```
   *Inserisci nel file `.env` locale le credenziali GinniPAL desiderate.*

---

## 🚀 Esecuzione e Sviluppo

### Avvio Server di Sviluppo

Per avviare Metro Bundler:

```bash
npm run start
# oppure
npx expo start
```

### Modalità di Esecuzione Disponibili

- **Tunneling (consigliato per test su dispositivi fisici tramite Expo Go)**:
  ```bash
  npx expo start --tunnel
  ```
- **Con pulizia cache Metro**:
  ```bash
  npx expo start -c --tunnel
  ```
- **Su Emulatore Android**:
  ```bash
  npm run android
  ```
- **Su Simulatore iOS**:
  ```bash
  npm run ios
  ```
- **Versione Web**:
  ```bash
  npm run web
  ```

### Diagnostica e Linting

```bash
# Esecuzione del linter
npm run lint

# Controllo tipi TypeScript
npx tsc --noEmit
```

> [!NOTE]
> Il server Metro espone internamente gli endpoint proxy `/api/ginnipal` sulla porta **8081**. Assicurarsi che la porta sia libera prima di avviare il dev server.

---

## 🏗️ Build & Distribuzione

Per compilare il pacchetto autonomo di distribuzione per Android (`.apk`):

```bash
# Compilazione locale automatica (consigliata)
npm run build:apk
# oppure facendo doppio clic su build-apk.bat

# In alternativa, procedura manuale:
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
```

L'APK compilato finale viene posizionato automaticamente in `dist-apk/CusCosenza.apk`.

---

## ⚖️ Disclaimer & Note Legali

- **Progetto Indipendente**: Questo progetto è un client non ufficiale sviluppato in via indipendente a supporto della comunità degli studenti e tesserati del CUS Cosenza / Università della Calabria.
- **Marchi e Diritti**: I nomi *CUS Cosenza*, *GinniPAL*, *Paneura* e i relativi loghi sono di proprietà dei rispettivi detentori. L'applicazione non è affiliata né sponsorizzata formalmente da essi.
- **Uso dei Dati**: Le credenziali di accesso sono utilizzate unicamente per interagire con i server di competenza del portale e non vengono salvate né condivise con server di terze parti.

---

## 👨‍💻 Autore

Sviluppato da **Mario Costabile**  
Studente di *Ingegneria Informatica* — **Università della Calabria (Unical)**, Dipartimento DIMES.

- GitHub: [@mariocostabile](https://github.com/mariocostabile)
- Repository: [CusApp su GitHub](https://github.com/mariocostabile/CusApp)

---

<div align="center">
  Rilasciato sotto licenza <a href="./LICENSE">MIT</a>.
</div>
