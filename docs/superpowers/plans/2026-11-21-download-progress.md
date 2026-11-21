# Percentuale e barra nel download dell'aggiornamento — piano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mostrare percentuale e barra di download dell'aggiornamento su tutti i telefoni.

**Architecture:** la dimensione dell'APK (`size` dell'asset GitHub) viene letta in `parseRelease` e
usata da una funzione pura `downloadFraction` come totale quando il server non manda `Content-Length`.
`AppDialog` riceve `children` opzionali per ospitare la barra.

**Tech Stack:** Expo 57, React Native 0.86, TypeScript, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-21-download-progress-design.md`

## Global Constraints
- Nessuna dipendenza nuova, nessuna chiamata di rete in più.
- Release senza `size` valida: l'aggiornamento resta proposto, `apkSize` è `null`.
- Altri usi di `AppDialog` invariati.
- Conventional Commits (`fix:`), niente versione o tag a mano (`docs/RELEASING.md`).
- Lavoro su branch nuovo `fix/percentuale-download` creato da `master` aggiornato.

## Review Focus
- `size` assente, 0, negativa, decimale o stringa → `apkSize: null` (test in Task 1).
- Server che manda `totalBytes` → si usa quello, non `apkSize` (test in Task 1).
- `bytesWritten` oltre il totale (size sbagliata) → frazione limitata a 1, barra mai oltre il 100% (test in Task 1).
- Nessun totale disponibile → solo "Download in corso…", nessuna barra (verifica in Task 2).
- Gli altri dialog (login, prenotazioni) senza `children` → aspetto identico (verifica in Task 2).

---

### Task 0: Branch

- [ ] `git checkout master && git pull --ff-only && git checkout -b fix/percentuale-download`
- [ ] Controllare che `node_modules/.bin` non contenga file `.cmd` (dipendenze installate da Linux).

### Task 1: dimensione APK e frazione di download

**Files:**
- Modify: `src/services/updateRelease.ts`
- Modify: `src/services/updateInstaller.ts`
- Test: `src/services/updateRelease.test.mjs`

**Interfaces:**
- Produces: `AvailableUpdate.apkSize: number | null`;
  `export function downloadFraction(bytesWritten: number, totalBytes: number, apkSize: number | null): number | null`
  in `updateRelease.ts`.

- [ ] **Step 1: test che falliscono.** Nel fixture `release()` l'asset ottiene `size: 52_428_800`;
  nel test "parseRelease restituisce l'aggiornamento…" l'oggetto atteso ottiene `apkSize: 52_428_800`.
  Nuovi test:

```js
test('parseRelease mette apkSize a null se size non è un intero positivo', () => {
  for (const size of [undefined, 0, -1, 1.5, '100']) {
    const assets = [{ name: 'CusCosenza-v2.7.0.apk', browser_download_url: APK_URL, size }];
    assert.equal(parseRelease(release({ assets }), '2.6.5').apkSize, null);
  }
});

test('downloadFraction usa il totale del server, poi apkSize, altrimenti null', () => {
  assert.equal(downloadFraction(50, 200, 100), 0.25);
  assert.equal(downloadFraction(50, 0, 100), 0.5);
  assert.equal(downloadFraction(50, -1, 100), 0.5);
  assert.equal(downloadFraction(50, 0, null), null);
  assert.equal(downloadFraction(150, 0, 100), 1);
});
```

- [ ] **Step 2:** `npm test` → FAIL (`downloadFraction` non esportata, `apkSize` mancante).
- [ ] **Step 3: implementare.** In `ReleaseAsset` aggiungere `size?: unknown`; in `parseRelease`
  `apkSize = Number.isInteger(size) && size > 0 ? size : null`. `downloadFraction` come da Interfaces
  (totale = `totalBytes > 0 ? totalBytes : apkSize`; `Math.min(1, bytesWritten / totale)`).
  In `updateInstaller.ts` l'`onProgress` chiama `onProgress(downloadFraction(bytesWritten, totalBytes, update.apkSize))`;
  aggiornare il commento JSDoc ("null se la dimensione non è nota").
- [ ] **Step 4:** `npm test` → tutti PASS; `npx tsc --noEmit` → pulito.
- [ ] **Step 5: commit** `fix(update): percentuale di download anche senza Content-Length`

### Task 2: barra nel popup

**Files:**
- Modify: `src/components/app-dialog.tsx`
- Modify: `src/components/update-prompt.tsx`

**Interfaces:**
- Consumes: `Phase` `downloading.progress: number | null` (già esistente, ora valorizzato da Task 1).
- Produces: prop `children?: ReactNode` di `AppDialog`, resa tra `desc` e `actions`.

- [ ] **Step 1:** `AppDialog`: prop `children?: ReactNode`, resa subito dopo `<Text style={styles.desc}>`.
- [ ] **Step 2:** `UpdatePrompt`: in fase `downloading` con `progress !== null` passare come children
  una barra: contenitore `width: '100%'`, `height: 10`, `borderRadius: 5`, `backgroundColor: '#E2E8F0'`,
  `overflow: 'hidden'`, `marginBottom: 20`; riempimento `height: '100%'`, `backgroundColor: '#0284C7'`,
  `width: \`${Math.round(progress * 100)}%\``. Stili in uno `StyleSheet.create` nel file. Con
  `progress === null` nessuna barra. Testo invariato ("Download N%…" / "Download in corso…").
- [ ] **Step 3:** `npx tsc --noEmit` pulito; `npm run lint` senza errori nuovi rispetto ai 12 noti
  (elenco in `.ai/progetto.md`).
- [ ] **Step 4: verifica a mano** (dall'utente, su telefono con build di prova o release): popup con
  percentuale e barra che avanza; dialog di login/prenotazione invariati.
- [ ] **Step 5: commit** `fix(update): barra di avanzamento nel download dell'aggiornamento`
- [ ] **Step 6:** push del branch e PR verso `master` solo dopo ok dell'utente.
