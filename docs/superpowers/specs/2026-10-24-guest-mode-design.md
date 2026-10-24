# Modalità ospite — Design

Data: 2026-10-24

## Obiettivo

Permettere di usare CusApp senza account GinniPAL con funzioni limitate (affluenza sala pesi live), sbloccando tutto con l'accesso. La scelta "ospite" viene ricordata tra un avvio e l'altro.

## Comportamento

### Ingresso
- La schermata di login resta la prima vista per chi non ha né sessione né flag ospite.
- Sotto il pulsante ACCEDI compare il link **"Continua senza accedere"**.

### Avvio dell'app (`restoreSessionAndSync` in `src/app/index.tsx`)
1. Credenziali salvate → utente loggato (come oggi). Le credenziali vincono sul flag ospite.
2. Altrimenti flag ospite attivo → dashboard ospite.
3. Altrimenti → login.

Condizione per mostrare il login: `!isAuthenticated && !isGuest`.

### Transizioni
| Azione | Effetto in memoria | Flag salvato |
|---|---|---|
| "Continua senza accedere" | `isGuest = true` | salvato a `true` |
| "Accedi" (header o card ospite) | `isGuest = false` → mostra login | **invariato** (resta `true`) |
| Login riuscito (`handleLogin` e `handleScraperLoginSuccess`) | `isAuthenticated = true` | cancellato |
| Logout | come oggi | cancellato da `clearUserSession()` |

Conseguenza: un ospite che apre il login e chiude l'app senza accedere, alla riapertura torna nella dashboard ospite. Dal login, "Continua senza accedere" fa anche da "torna indietro".

### Dashboard ospite
- **Header**: il pulsante "Esci" diventa "Accedi".
- **Card "Accedi per sbloccare"** al posto di: welcome card, banner certificato medico, card abbonamento, card prenotazioni. Contiene titolo, 3 vantaggi (ingressi residui, prenotazione turni, cancellazione con countdown) e pulsante "Accedi".
- **Card affluenza**: invariata e completa.
- **Pull-to-refresh**: chiama solo `fetchLiveGoogleCrowd()`, non GinniPAL.
- Le modali di prenotazione e cancellazione non sono raggiungibili: i loro trigger stanno nelle card nascoste.

## Modifiche per file

### `src/services/storageService.ts`
- Nuova chiave `KEY_GUEST_MODE = '@cusapp_guest_mode'`.
- `saveGuestMode(enabled: boolean): Promise<void>` — `true` scrive `'1'`, `false` rimuove la chiave.
- `getGuestMode(): Promise<boolean>` — errore di lettura → `false`.
- `clearUserSession()` rimuove anche `KEY_GUEST_MODE`.
- Gestione errori come le funzioni esistenti (`try/catch`, `console.warn` solo in `__DEV__`).

### `src/app/index.tsx`
- Stato `isGuest`.
- Avvio: lettura del flag se non c'è sessione.
- Link "Continua senza accedere" nella schermata di login.
- Header: "Accedi" al posto di "Esci" se ospite.
- Card "Accedi per sbloccare" (stili nello `StyleSheet` esistente, coerenti con le card attuali).
- Calcoli che dipendono da `dashboardData` (es. `usagePercentage`) non devono produrre errori con dati vuoti; in modalità ospite non vengono mostrati.
- `handleFullRefresh`: salta `fetchLiveGinnipalData` se ospite.
- I due percorsi di login riuscito cancellano il flag ospite.

## Errori
- Lettura del flag fallita → considerato `false` → login. Caso sicuro.
- Scrittura del flag fallita → la sessione corrente resta ospite; al prossimo avvio si vede il login. Accettabile.

## Fuori scope
- Test automatici (jest-expo): possibile feature futura separata.
- Dati finti / vetrina demo.

## Verifica (manuale su Expo)
1. Primo avvio senza sessione → login con link "Continua senza accedere".
2. Tap sul link → dashboard ospite con card "Accedi per sbloccare" + affluenza.
3. Pull-to-refresh da ospite → aggiorna affluenza, nessun errore GinniPAL.
4. Chiudi e riapri → dashboard ospite.
5. "Accedi" → login; chiudi e riapri senza accedere → dashboard ospite.
6. "Accedi" → login riuscito → dashboard completa; chiudi e riapri → resta loggato.
7. Logout → login; chiudi e riapri → login.
