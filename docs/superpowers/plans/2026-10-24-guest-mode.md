# Modalità ospite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usare CusApp senza account GinniPAL (solo affluenza), con scelta "ospite" ricordata tra gli avvii e sblocco completo con l'accesso.

**Architecture:** Un flag `@cusapp_guest_mode` in AsyncStorage gestito da `storageService.ts`; uno stato `isGuest` in `App` (`src/app/index.tsx`) che, insieme a `isAuthenticated`, decide se mostrare login o dashboard. In dashboard ospite le card personali sono sostituite da una card "Accedi per sbloccare". Spec: `docs/superpowers/specs/2026-10-24-guest-mode-design.md`.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, `@react-native-async-storage/async-storage`.

**Note:**
- Il progetto non ha test automatici (scelta esplicita: rimandati a una feature futura). La verifica è `npx tsc --noEmit` + `npm run lint` + controllo manuale su Expo (Task 6).
- La cartella non è un repository git: nessuno step di commit.
- Tutti i comandi si lanciano da `C:\Users\mario\Antigravity\CusCosenza\CusApp`.

---

## File toccati

- Modify: `src/services/storageService.ts` — persistenza del flag ospite.
- Modify: `src/app/index.tsx` — stato, avvio, login, header, card ospite, refresh, stili.

---

### Task 1: Flag ospite in storageService

**Files:**
- Modify: `src/services/storageService.ts`

- [ ] **Step 1: Aggiungi la chiave** sotto `const KEY_DASHBOARD_DATA = '@cusapp_dashboard_data';`

```ts
const KEY_GUEST_MODE = '@cusapp_guest_mode';
```

- [ ] **Step 2: Aggiungi le due funzioni** subito prima di `export async function clearUserSession()`

```ts
/**
 * Persists the "continue without login" choice across app launches.
 */
export async function saveGuestMode(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await AsyncStorage.setItem(KEY_GUEST_MODE, '1');
    } else {
      await AsyncStorage.removeItem(KEY_GUEST_MODE);
    }
  } catch (e) {
    if (__DEV__) {
      console.warn('[StorageService] Error saving guest mode:', e);
    }
  }
}

export async function getGuestMode(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY_GUEST_MODE)) === '1';
  } catch (e) {
    if (__DEV__) {
      console.warn('[StorageService] Error reading guest mode:', e);
    }
    return false;
  }
}
```

- [ ] **Step 3: Logout cancella anche il flag.** In `clearUserSession()` sostituisci

```ts
    await AsyncStorage.multiRemove([
      KEY_USER_EMAIL,
      KEY_LEGACY_USER_PASSWORD,
      KEY_DASHBOARD_DATA,
    ]);
```

con

```ts
    await AsyncStorage.multiRemove([
      KEY_USER_EMAIL,
      KEY_LEGACY_USER_PASSWORD,
      KEY_DASHBOARD_DATA,
      KEY_GUEST_MODE,
    ]);
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore in `storageService.ts`.

---

### Task 2: Stato `isGuest` e ripristino all'avvio

**Files:**
- Modify: `src/app/index.tsx` (import ~righe 26-31, stato ~riga 351, `restoreSessionAndSync` ~righe 416-450)

- [ ] **Step 1: Import.** Sostituisci

```ts
import {
  saveUserSession,
  getUserSession,
  saveCachedDashboard,
  clearUserSession,
} from '../services/storageService';
```

con

```ts
import {
  saveUserSession,
  getUserSession,
  saveCachedDashboard,
  clearUserSession,
  saveGuestMode,
  getGuestMode,
} from '../services/storageService';
```

- [ ] **Step 2: Stato.** Sotto `const [isAuthenticated, setIsAuthenticated] = useState(false);` aggiungi

```ts
  const [isGuest, setIsGuest] = useState(false);
```

- [ ] **Step 3: Ripristino.** In `restoreSessionAndSync`, il blocco `if (session && session.email && session.password) { ... }` termina con

```ts
            .catch((err) => {
              if (__DEV__) {
                console.warn('[App] Background live sync notice:', err);
              }
            });
        }
      } catch (err) {
```

Sostituiscilo con (aggiunge solo il ramo `else if`):

```ts
            .catch((err) => {
              if (__DEV__) {
                console.warn('[App] Background live sync notice:', err);
              }
            });
        } else if (await getGuestMode()) {
          if (isMounted) {
            setIsGuest(true);
          }
        }
      } catch (err) {
```

Le credenziali salvate vincono: il flag si legge solo se non c'è sessione.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore (warning "isGuest unused" possibile dal lint, sparisce nei task successivi).

---

### Task 3: Login — link "Continua senza accedere" e pulizia del flag

**Files:**
- Modify: `src/app/index.tsx` (`handleLogin` ~riga 663, `handleScraperLoginSuccess` ~riga 672, gate login ~riga 752, fine `loginCard` ~riga 830)

- [ ] **Step 1: Handler.** Subito prima di `const handleLogin = async () => {` aggiungi

```ts
  const handleEnterGuest = () => {
    setError('');
    setIsGuest(true);
    saveGuestMode(true);
  };

  // Shows the login form; the saved guest flag stays until a real login succeeds.
  const handleGoToLogin = () => {
    setIsGuest(false);
  };
```

- [ ] **Step 2: Login riuscito via fetch.** In `handleLogin` sostituisci

```ts
      setIsAuthenticated(true);
      await saveUserSession(cleanEmail, cleanPassword, liveData);
```

con

```ts
      setIsAuthenticated(true);
      await saveUserSession(cleanEmail, cleanPassword, liveData);
      await saveGuestMode(false);
```

- [ ] **Step 3: Login riuscito via scraper.** Sostituisci

```ts
  const handleScraperLoginSuccess = () => {
    setIsLoading(false);
    setIsAuthenticated(true);
    scraperRef.current?.fetchDashboard();
  };
```

con

```ts
  const handleScraperLoginSuccess = () => {
    setIsLoading(false);
    setIsAuthenticated(true);
    saveGuestMode(false);
    scraperRef.current?.fetchDashboard();
  };
```

- [ ] **Step 4: Gate.** Sostituisci

```ts
  // If not logged in
  if (!isAuthenticated) {
```

con

```ts
  // If not logged in and not browsing as guest
  if (!isAuthenticated && !isGuest) {
```

- [ ] **Step 5: Link nel login.** Sostituisci

```tsx
                    <Text style={styles.primaryButtonText}>ACCEDI</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.footerCopy}>CusApp • CUS Cosenza</Text>
```

con

```tsx
                    <Text style={styles.primaryButtonText}>ACCEDI</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.guestLinkBtn}
                onPress={handleEnterGuest}
                disabled={isLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.guestLinkText}>Continua senza accedere</Text>
              </TouchableOpacity>

              <Text style={styles.footerCopy}>CusApp • CUS Cosenza</Text>
```

- [ ] **Step 6: Stili.** Subito dopo il blocco `footerCopy: { ... },` nello `StyleSheet` aggiungi

```ts
  guestLinkBtn: {
    alignSelf: 'center',
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  guestLinkText: {
    color: '#0284C7',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
```

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore.

---

### Task 4: Dashboard ospite — header, card "Accedi per sbloccare", card personali nascoste

**Files:**
- Modify: `src/app/index.tsx` (header ~righe 865-878, card ~righe 892-1092, StyleSheet)

- [ ] **Step 1: Header.** Sostituisci

```tsx
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Text style={styles.logoutBtnText}>Esci</Text>
        </TouchableOpacity>
```

con

```tsx
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={isGuest ? handleGoToLogin : handleLogout}
          activeOpacity={0.7}
        >
          <Text style={styles.logoutBtnText}>{isGuest ? 'Accedi' : 'Esci'}</Text>
        </TouchableOpacity>
```

- [ ] **Step 2: Apri il blocco delle card personali + card ospite.** Sostituisci

```tsx
        {/* User Welcome Card */}
        {(() => {
```

con

```tsx
        {/* Guest Mode: Login teaser replacing personal cards */}
        {isGuest && (
          <View style={styles.card}>
            <Text style={styles.cardSubHeader}>MODALITÀ OSPITE</Text>
            <Text style={styles.cardMainTitle}>Accedi per sbloccare tutto</Text>
            <View style={styles.guestPerksList}>
              <Text style={styles.guestPerk}>• Ingressi residui e scadenza dell'abbonamento</Text>
              <Text style={styles.guestPerk}>• Prenotazione dei turni in pochi tap</Text>
              <Text style={styles.guestPerk}>• Cancellazione con countdown fino a 1 ora prima</Text>
            </View>
            <TouchableOpacity
              style={styles.bookActionBtn}
              onPress={handleGoToLogin}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.bookActionBtnText}>ACCEDI CON IL TUO ACCOUNT</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isGuest && (
        <>
        {/* User Welcome Card */}
        {(() => {
```

- [ ] **Step 3: Chiudi il blocco prima della card affluenza.** Sostituisci

```tsx
        {/* 3. Scheda Affluenza: Native In-App Real-Time Crowd Analytics Card */}
```

con

```tsx
        </>
        )}

        {/* 3. Scheda Affluenza: Native In-App Real-Time Crowd Analytics Card */}
```

Così welcome card, certificato medico, abbonamento e prenotazioni sono dentro `{!isGuest && (<> ... </>)}`; la card affluenza resta fuori, sempre visibile. Le modali di prenotazione/cancellazione restano montate ma da ospite non c'è alcun trigger per aprirle.

- [ ] **Step 4: Stili.** Subito dopo il blocco `cardTitle: { ... },` nello `StyleSheet` aggiungi

```ts
  guestPerksList: {
    marginTop: 12,
    marginBottom: 18,
    gap: 6,
  },
  guestPerk: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
```

- [ ] **Step 5: Type check e lint**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore.

Run: `npm run lint`
Expected: nessun nuovo errore su `index.tsx` / `storageService.ts`.

---

### Task 5: Pull-to-refresh da ospite senza GinniPAL

**Files:**
- Modify: `src/app/index.tsx` (`handleFullRefresh` ~righe 469-477)

- [ ] **Step 1: Sostituisci**

```ts
      const [liveGinnipal, snap] = await Promise.all([
        fetchLiveGinnipalData(email, password),
        fetchLiveGoogleCrowd(),
      ]);
```

con

```ts
      const [liveGinnipal, snap] = await Promise.all([
        isGuest ? Promise.resolve(null) : fetchLiveGinnipalData(email, password),
        fetchLiveGoogleCrowd(),
      ]);
```

Il controllo esistente `if (liveGinnipal && liveGinnipal.name)` gestisce già `null`.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore.

---

### Task 6: Verifica manuale su Expo

- [ ] **Step 1: Pulisci lo stato dell'app** (disinstalla/reinstalla o "Cancella dati" di Expo Go) per partire senza sessione né flag.
- [ ] **Step 2: Avvia** `npx expo start` e apri l'app.
- [ ] **Step 3: Esegui i 7 controlli della spec**
  1. Primo avvio → login con link "Continua senza accedere".
  2. Tap sul link → card "Accedi per sbloccare" + card affluenza; header mostra "Accedi".
  3. Pull-to-refresh → affluenza aggiornata, nessun alert/errore GinniPAL.
  4. Chiudi e riapri → dashboard ospite.
  5. "Accedi" → login; chiudi e riapri senza accedere → dashboard ospite.
  6. "Accedi" → login riuscito → dashboard completa; chiudi e riapri → resta loggato.
  7. "Esci" → login; chiudi e riapri → login.
