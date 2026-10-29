# Scheda Affluenza: tab "LIVE" reale + nuova parte superiore

Data: 2026-10-29
File coinvolto: `src/app/index.tsx` (card "Stima Affluenza Sala Pesi", ~righe 1136-1335)

## Problema

1. La tab del giorno corrente mostra sempre `Oggi • LIVE` quando la palestra è aperta (stringa hardcoded), anche se Google non fornisce più dati live.
2. La parte superiore del box, senza dati live, ripete la stessa percentuale due volte ("Calmo • ~25%" e "Affluenza tipica: ~25%") e non dà indicazioni pratiche.
3. Per gli altri giorni / palestra chiusa, "Orario di punta: 18:00 - 20:30" e "Fasce consigliate 10:00 - 15:00 (~15-25%)" sono testi fissi uguali per tutti i giorni, non derivati dai dati.

## Fuori scope

Grafico a barre orario, header della card, box sabato/domenica, modale di prenotazione, `googleCrowdService.ts`, pill "LIVE/STIMA" e logica `isLive` esistente: invariati.

## 1. Tab di oggi

- Calcolare `isTodayLiveNow`: l'item di `crowdWeeklyData[todayCrowdKey].hours` con `hour === currentHour` ha `isLive === true`.
- Ramo aperto feriale: `Oggi • LIVE` se `isTodayLiveNow`, altrimenti `Oggi • Aperto`.
- Pallino (`tabLiveDot`) e bordo (`crowdDayTabLiveBorder`) restano legati a `isToday && isGymOpenNow` (segnale "oggi aperto").
- Altri rami invariati: `Chiuso`, `Apre alle 10`, `Mattina`.

## 2. Parte superiore — oggi, palestra aperta

Layout (dall'alto):

```
  STIMA • MERCOLEDÌ        Aggiornato: ore 17:05     ← invariato
        CALMO                                        ← level, grande, colore = item.color
  Sala tranquilla, attrezzi liberi                   ← item.description
        ~25% di affluenza                            ← item.percent, piccolo
  ↗ Alle 18:00: Affollato (~75%)                     ← trend
  ⭐ Meglio oggi: 21:00 (~55%)                        ← consiglio
```

Regole:

- **Item corrente**: `liveCrowdItem` (già calcolato).
- **Trend**: item con `hour === liveCrowdItem.hour + 1` nella lista del giorno.
  - Freccia `↗` se `next.percent > current.percent`, `↘` se minore, `→` se uguale.
  - Testo: `{freccia} Alle {next.label}: {next.level} (~{next.percent}%)`.
  - Se non esiste ora successiva: `Chiude alle 22:00`.
- **Consiglio**: tra gli item con `hour > liveCrowdItem.hour`, quello con `percent` minimo (a parità, l'ora più vicina).
  - Se nessun item successivo o se `liveCrowdItem.percent <= min`: `⭐ Adesso è il momento migliore di oggi`.
  - Altrimenti: `⭐ Meglio oggi: {best.label} (~{best.percent}%)`.
- **Dati live presenti** (`liveCrowdItem.isLive`): sotto la percentuale compare anche `comparisonStatus` ("Più/Meno affollato del solito", colori rosso/verde come oggi) e la barra grigia "Affluenza tipica … ~{typical}%" esistente.
- **Senza dati live**: la barra "Affluenza tipica" non viene mostrata.

## 3. Parte superiore — altri giorni o palestra chiusa oggi

- Pill e label "Google Maps" invariati.
- Sostituire i testi fissi con valori calcolati da `activeCrowdList`:
  - `Picco: {fascia} (~{max}%)` — fascia di ore consecutive con `percent` massimo.
  - `Più calmo: {fascia} (~{min}%)` — fascia di ore consecutive con `percent` minimo.
  - Fascia: parte dalla prima ora con quel valore e si estende alle ore immediatamente successive con lo stesso valore; formato `HH:00-HH:00` dove la fine è l'ultima ora + 1 (es. 10,11,12,13 → `10:00-14:00`). Ora singola → `HH:00`. Se il valore ricorre in fasce non consecutive, si mostra solo la prima.
- Lista vuota: non mostrare le due righe.

## Implementazione

- Una funzione pura in `index.tsx` (fuori dal componente), es. `getCrowdInsights(hours, currentHour)` → `{ next, best, peak, calm }`, con `next`/`best` relativi a `currentHour`, `peak`/`calm` sull'intera giornata come `{ range: string, percent: number }`. Nessun nuovo file, nessuna dipendenza.
- Nuovi stili nello `StyleSheet` esistente, coerenti con quelli attuali (`liveStatusValue`, `daySummaryDesc`). Rimuovere gli stili che restano inutilizzati.

## Verifica

- `npx tsc --noEmit` senza nuovi errori.
- Controllo visivo: oggi aperto senza live (caso reale attuale), oggi aperto con `isLive` (dati baseline di mercoledì 17:00 / venerdì 18:00), ultima ora (21:00), altro giorno feriale, oggi prima delle 10.
