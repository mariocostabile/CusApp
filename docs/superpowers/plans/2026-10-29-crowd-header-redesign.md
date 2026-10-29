# Redesign parte superiore Scheda Affluenza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La tab di oggi mostra "LIVE" solo con dati live reali; la parte superiore del box affluenza mostra stato, frase, trend e momento migliore; gli altri giorni mostrano picco e fascia calma calcolati dai dati.

**Architecture:** Le regole (trend, momento migliore, fasce picco/calma) vanno in un modulo puro `src/services/crowdInsights.ts`, senza dipendenze React, verificabile con Node. `src/app/index.tsx` calcola i valori una volta per render e li mostra nel JSX esistente.

**Tech Stack:** Expo / React Native, TypeScript. Nessuna suite di test (jest rinviato): verifica con script Node usa-e-getta (Node 24 esegue `.ts` nativamente) + `npx tsc --noEmit`.

Spec: `docs/superpowers/specs/2026-10-29-crowd-header-redesign-design.md`

Nota di deviazione dalla spec: la spec suggeriva la funzione dentro `index.tsx`; la mettiamo in un file a parte perché `index.tsx` non è importabile da Node (JSX, RN) e così la logica è verificabile. Il tipo di input è strutturale, quindi `CrowdHourItem` di `index.tsx` è compatibile senza import circolari.

---

## File

- Create: `src/services/crowdInsights.ts` — funzioni pure: `formatHour`, `getTrendText`, `getBestTimeText`, `getExtremeRange`.
- Modify: `src/app/index.tsx` — import, valori derivati (~riga 515), etichetta tab (~riga 1178), box superiore (~righe 1253-1335), nuovi stili (~riga 2499).

---

### Task 1: Modulo `crowdInsights.ts`

**Files:**
- Create: `src/services/crowdInsights.ts`
- Test (usa-e-getta, non committato): `$CLAUDE_JOB_DIR/tmp/check-crowd-insights.mjs`

- [ ] **Step 1: Scrivere lo script di verifica (fallisce: modulo assente)**

File `$CLAUDE_JOB_DIR/tmp/check-crowd-insights.mjs` (sostituire il percorso assoluto se diverso):

```js
import assert from 'node:assert/strict';
import {
  formatHour,
  getTrendText,
  getBestTimeText,
  getExtremeRange,
} from 'file:///C:/Users/mario/Antigravity/CusCosenza/CusApp/src/services/crowdInsights.ts';

const h = (hour, percent, level = 'L') => ({ hour, label: formatHour(hour), percent, level });
// Mercoledì baseline semplificato
const day = [h(10, 10), h(11, 10), h(12, 10), h(13, 10), h(14, 25), h(15, 35), h(16, 55), h(17, 96), h(18, 90), h(19, 85), h(20, 70), h(21, 55)];

assert.equal(formatHour(9), '09:00');
assert.equal(formatHour(18), '18:00');

// Trend
assert.equal(getTrendText(day, day[6]), '↗ Alle 17:00: L (~96%)');
assert.equal(getTrendText(day, day[8]), '↘ Alle 19:00: L (~85%)');
assert.equal(getTrendText(day, day[0]), '→ Alle 11:00: L (~10%)');
assert.equal(getTrendText(day, day[11]), 'Chiude alle 22:00');

// Momento migliore
assert.equal(getBestTimeText(day, day[7]), '⭐ Meglio oggi: 21:00 (~55%)');
assert.equal(getBestTimeText(day, day[0]), '⭐ Adesso è il momento migliore di oggi');
assert.equal(getBestTimeText(day, day[11]), '⭐ Adesso è il momento migliore di oggi');
// parità tra ore successive → la più vicina
assert.equal(getBestTimeText([h(17, 80), h(18, 40), h(19, 40)], h(17, 80)), '⭐ Meglio oggi: 18:00 (~40%)');

// Fasce
assert.deepEqual(getExtremeRange(day, 'min'), { range: '10:00-14:00', percent: 10 });
assert.deepEqual(getExtremeRange(day, 'max'), { range: '17:00', percent: 96 });
assert.deepEqual(getExtremeRange([h(18, 90), h(19, 90), h(20, 50), h(21, 90)], 'max'), { range: '18:00-20:00', percent: 90 });
assert.deepEqual(getExtremeRange([h(19, 90), h(18, 90)], 'max'), { range: '18:00-20:00', percent: 90 }); // input non ordinato
assert.equal(getExtremeRange([], 'max'), null);

console.log('OK');
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `node "$CLAUDE_JOB_DIR/tmp/check-crowd-insights.mjs"`
Expected: errore `ERR_MODULE_NOT_FOUND` per `crowdInsights.ts`.

- [ ] **Step 3: Implementare il modulo**

File `src/services/crowdInsights.ts`:

```ts
/**
 * Pure helpers that turn an hourly crowd list into human-readable hints
 * for the "Stima Affluenza" card (trend, best time, peak / calm ranges).
 */

export interface CrowdInsightHour {
  hour: number;
  label: string;
  percent: number;
  level: string;
}

export interface CrowdRange {
  range: string;
  percent: number;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function getTrendText(hours: CrowdInsightHour[], current: CrowdInsightHour): string {
  const next = hours.find((h) => h.hour === current.hour + 1);
  if (!next) return 'Chiude alle 22:00';
  const arrow = next.percent > current.percent ? '↗' : next.percent < current.percent ? '↘' : '→';
  return `${arrow} Alle ${next.label}: ${next.level} (~${next.percent}%)`;
}

export function getBestTimeText(hours: CrowdInsightHour[], current: CrowdInsightHour): string {
  const best = hours
    .filter((h) => h.hour > current.hour)
    .sort((a, b) => a.hour - b.hour)
    .reduce<CrowdInsightHour | null>((acc, h) => (!acc || h.percent < acc.percent ? h : acc), null);
  if (!best || current.percent <= best.percent) return '⭐ Adesso è il momento migliore di oggi';
  return `⭐ Meglio oggi: ${best.label} (~${best.percent}%)`;
}

/** First run of consecutive hours sharing the day's max (or min) percent, e.g. "10:00-14:00". */
export function getExtremeRange(hours: CrowdInsightHour[], kind: 'max' | 'min'): CrowdRange | null {
  if (hours.length === 0) return null;
  const sorted = [...hours].sort((a, b) => a.hour - b.hour);
  const values = sorted.map((h) => h.percent);
  const target = kind === 'max' ? Math.max(...values) : Math.min(...values);
  const start = sorted.findIndex((h) => h.percent === target);
  let end = start;
  while (
    end + 1 < sorted.length &&
    sorted[end + 1].percent === target &&
    sorted[end + 1].hour === sorted[end].hour + 1
  ) {
    end++;
  }
  const range =
    end === start
      ? formatHour(sorted[start].hour)
      : `${formatHour(sorted[start].hour)}-${formatHour(sorted[end].hour + 1)}`;
  return { range, percent: target };
}
```

- [ ] **Step 4: Eseguire e verificare che passi**

Run: `node "$CLAUDE_JOB_DIR/tmp/check-crowd-insights.mjs"`
Expected: `OK` (eventuale warning sperimentale di type stripping è accettabile).

- [ ] **Step 5: Commit**

```bash
git add src/services/crowdInsights.ts
git commit -m "feat: helper puri per trend e fasce affluenza"
```

---

### Task 2: Tab di oggi — "LIVE" solo con dati live

**Files:**
- Modify: `src/app/index.tsx` (~riga 510 e ~riga 1178)

- [ ] **Step 1: Aggiungere il flag sotto `const isTodaySelected = ...` (~riga 510)**

```ts
  const isTodayLiveNow =
    isGymOpenNow &&
    !!crowdWeeklyData[todayCrowdKey]?.hours?.find((h) => h.hour === currentHour)?.isLive;
```

- [ ] **Step 2: Sostituire l'etichetta hardcoded (~riga 1178)**

Da:
```tsx
                  displayLabel = `${tab.label} (Oggi • LIVE)`;
```
A:
```tsx
                  displayLabel = `${tab.label} (Oggi • ${isTodayLiveNow ? 'LIVE' : 'Aperto'})`;
```

Pallino (`tabLiveDot`) e bordo (`crowdDayTabLiveBorder`) restano invariati.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore rispetto a prima della modifica (annotare eventuali errori preesistenti prima di iniziare).

- [ ] **Step 4: Commit**

```bash
git add src/app/index.tsx
git commit -m "fix: tab affluenza mostra LIVE solo con dati live reali"
```

---

### Task 3: Box superiore — oggi aperto (design A) e altri giorni

**Files:**
- Modify: `src/app/index.tsx` (import ~riga 18, valori ~riga 518, JSX ~righe 1253-1335, stili ~riga 2499)

- [ ] **Step 1: Import (sotto la riga di import di `googleCrowdService`)**

```ts
import { getTrendText, getBestTimeText, getExtremeRange } from '../services/crowdInsights';
```

- [ ] **Step 2: Valori derivati, subito dopo la definizione di `liveCrowdItem` (~riga 518)**

```ts
  const crowdTrendText = liveCrowdItem ? getTrendText(activeCrowdList, liveCrowdItem) : '';
  const crowdBestTimeText = liveCrowdItem ? getBestTimeText(activeCrowdList, liveCrowdItem) : '';
  const dayPeak = getExtremeRange(activeCrowdList, 'max');
  const dayCalm = getExtremeRange(activeCrowdList, 'min');
```

- [ ] **Step 3: Sostituire il ramo "oggi aperto" (~righe 1268-1312)**

Mantenere invariato il blocco `liveCenteredHeader` (pill + "Aggiornato"). Sostituire da `<View style={styles.liveStatusRowCentered}>` fino alla chiusura di `comparisonContainer` (inclusa) con:

```tsx
                    <View style={styles.liveStatusRowCentered}>
                      <Text style={[styles.crowdNowLevel, { color: liveCrowdItem.color }]}>
                        {liveCrowdItem.level.toUpperCase()}
                      </Text>
                      {!!liveCrowdItem.description && (
                        <Text style={styles.crowdNowDesc}>{liveCrowdItem.description}</Text>
                      )}
                      <Text style={styles.crowdNowPercent}>~{liveCrowdItem.percent}% di affluenza</Text>
                      {liveCrowdItem.isLive && (
                        <Text
                          style={[
                            styles.crowdNowComparison,
                            {
                              color: /Più/.test(liveCrowdItem.comparisonStatus || '')
                                ? '#EF4444'
                                : /Meno/.test(liveCrowdItem.comparisonStatus || '')
                                ? '#10B981'
                                : '#64748B',
                            },
                          ]}
                        >
                          {liveCrowdItem.comparisonStatus}
                        </Text>
                      )}
                    </View>

                    {/* Typical-level bar only when live data differs from history */}
                    {liveCrowdItem.isLive && (
                      <View style={[styles.comparisonContainer, { marginBottom: 12 }]}>
                        <View style={styles.comparisonBarGroup}>
                          <View style={styles.comparisonBarLabelRow}>
                            <Text style={styles.comparisonLabel} numberOfLines={1} ellipsizeMode="tail">
                              Affluenza tipica {activeDayData.name} ({liveCrowdItem.label}):
                            </Text>
                            <Text style={[styles.comparisonValue, { color: '#64748B' }]}>
                              ~{liveCrowdItem.typical}%
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
                    )}

                    <View style={styles.crowdInsightsBox}>
                      <Text style={styles.crowdInsightText}>{crowdTrendText}</Text>
                      <Text style={styles.crowdInsightText}>{crowdBestTimeText}</Text>
                    </View>
```

- [ ] **Step 4: Sostituire i testi fissi nel ramo "altri giorni / chiusa" (~righe 1324-1332)**

Da:
```tsx
                    <View style={styles.liveStatusRowCentered}>
                      <Text style={styles.liveStatusSubtitle}>Stima Tipica {activeDayData.name}:</Text>
                      <Text style={[styles.liveStatusValue, { color: '#0284C7' }]}>
                        Orario di punta: 18:00 - 20:30
                      </Text>
                    </View>
                    <Text style={[styles.daySummaryDesc, { textAlign: 'center' }]}>
                      Fasce consigliate e poco affollate: 10:00 - 15:00 (~15-25% di affluenza).
                    </Text>
```
A:
```tsx
                    {dayPeak && dayCalm && (
                      <View style={styles.liveStatusRowCentered}>
                        <Text style={styles.liveStatusSubtitle}>Stima Tipica {activeDayData.name}:</Text>
                        <Text style={[styles.liveStatusValue, { color: '#0284C7' }]}>
                          Picco: {dayPeak.range} (~{dayPeak.percent}%)
                        </Text>
                        <Text style={[styles.daySummaryDesc, { textAlign: 'center' }]}>
                          Più calmo: {dayCalm.range} (~{dayCalm.percent}%)
                        </Text>
                      </View>
                    )}
```

- [ ] **Step 5: Nuovi stili, dopo `liveStatusValue` (~riga 2499)**

```ts
  crowdNowLevel: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  crowdNowDesc: {
    fontSize: 13,
    color: '#334155',
    textAlign: 'center',
    marginTop: 2,
  },
  crowdNowPercent: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  crowdNowComparison: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  crowdInsightsBox: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
  },
  crowdInsightText: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
  },
```

Nessuno stile esistente diventa inutilizzato (`liveStatusSubtitle`, `liveStatusValue`, `daySummaryDesc`, `comparison*` restano in uso).

- [ ] **Step 6: Type-check e lint**

Run: `npx tsc --noEmit` e `npm run lint`
Expected: nessun nuovo errore/warning nei file toccati.

- [ ] **Step 7: Controllo visivo** (`npm start`, app su dispositivo/emulatore)

Verificare:
1. Oggi feriale aperto, senza live: livello grande colorato, frase, "~X% di affluenza", niente barra grigia, trend + consiglio.
2. Con live (temporaneamente impostare l'orologio sul mercoledì 17:xx o venerdì 18:xx con dati baseline `isLive: true`): compare "Più/Meno affollato del solito" e la barra tipica; tab "Oggi • LIVE".
3. Ultima ora (21:xx): "Chiude alle 22:00".
4. Altro giorno feriale: "Picco: … (~X%)" e "Più calmo: … (~Y%)" diversi da giorno a giorno.
5. Oggi prima delle 10: pill "OGGI • APRE ALLE 10:00" con picco/calma del giorno.

- [ ] **Step 8: Commit**

```bash
git add src/app/index.tsx
git commit -m "feat: nuova parte superiore scheda affluenza con trend e momento migliore"
```
