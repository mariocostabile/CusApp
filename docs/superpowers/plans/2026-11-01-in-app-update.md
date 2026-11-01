# Aggiornamenti in-app via GitHub Releases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CusApp mostra all'avvio un popup quando su GitHub Releases c'è una versione più nuova, scarica l'APK e apre l'installer; le release sono create da release-please e l'APK è compilato e firmato da GitHub Actions.

**Architecture:** Logica pura (`updateRelease.ts`: confronto versioni, validazione della risposta GitHub, pulizia note) separata dagli effetti (`updateService.ts`: fetch; `updateInstaller.ts`: download + intent). Un componente `UpdatePrompt` possiede lo stato del popup e riusa `AppDialog`. Un unico workflow `release.yml` esegue release-please e, solo quando crea una release, compila l'APK e lo allega.

**Tech Stack:** Expo SDK 57 / React Native 0.86, `expo-file-system` 57 (API `File`/`Paths`), `expo-intent-launcher`, `expo-constants`, release-please-action v5, GitHub Actions (ubuntu, JDK 17, Node 24), test con `node --test` (Node 24, type stripping nativo — niente jest).

**Spec:** `docs/superpowers/specs/2026-11-01-in-app-update-design.md` · **Regole:** `docs/RELEASING.md`

**Deviazioni dalla spec (decise in pianificazione):**
- La logica pura sta in `src/services/updateRelease.ts` (testabile con Node senza React Native); `updateService.ts` fa solo la fetch.
- Lo stato del popup sta in `src/components/update-prompt.tsx`; `_layout.tsx` monta solo `<UpdatePrompt />`.
- `AppDialog` riceve anche `keepOpen` per singola azione (necessario: oggi ogni pulsante chiude il dialog prima di eseguire l'azione).
- Sezioni del changelog in italiano (`Novità`, `Correzioni`, `Miglioramenti`) via `changelog-sections`; le note del popup tolgono solo il markdown.
- `release-type: simple` scrive anche `version.txt`: lo creiamo noi a `2.6.5`.
- `bootstrap-sha` = `f7bb5053b5f97ac3cfb72146a59414627a875663` (master al momento della pianificazione) così il primo changelog non include tutta la storia.

**Tutte le operazioni avvengono nel worktree** `C:\Users\mario\Antigravity\CusCosenza\CusApp\.claude\worktrees\in-app-update`, branch `worktree-in-app-update`. Non fare merge su `master`, non creare tag, non toccare `CusAppDemo/`.

---

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `app.config.js` | Create | Calcola `android.versionCode` da `version` |
| `app.config.test.mjs` | Create | Test di `versionCodeFrom` |
| `app.json` | Modify | `version` 2.6.5, via `versionCode`, permesso `REQUEST_INSTALL_PACKAGES` |
| `package.json` | Modify | Script `test`, dipendenze `expo-file-system`, `expo-intent-launcher` |
| `src/services/updateRelease.ts` | Create | Logica pura: versioni, parsing release, note, flag obbligatorio |
| `src/services/updateRelease.test.mjs` | Create | Test della logica pura |
| `src/services/updateService.ts` | Create (sostituisce la bozza) | `checkForUpdate()` — fetch di `releases/latest` |
| `src/services/updateInstaller.ts` | Create | `downloadAndInstall()` — download in cache + installer |
| `src/components/app-dialog.tsx` | Modify | Prop `icon`, `dismissible`; azione `keepOpen` |
| `src/components/update-prompt.tsx` | Create | Stato e UI del popup di aggiornamento |
| `src/app/_layout.tsx` | Modify | Monta `<UpdatePrompt />` |
| `release-please-config.json` | Create | Config release-please |
| `.release-please-manifest.json` | Create | Versione corrente (2.6.5) |
| `version.txt` | Create | Versione scritta da release-please (`simple`) |
| `.github/workflows/release.yml` | Create | release-please + build/upload APK |
| `docs/RELEASING.md` | Modify | Configurazione iniziale una tantum |

---

### Task 0: Preparazione del worktree

**Files:** nessun file di progetto (pulizia della bozza non committata).

- [ ] **Step 1: Verifica di essere nel worktree giusto**

Run: `git branch --show-current && git status --short`
Expected:
```
worktree-in-app-update
 M src/app/_layout.tsx
 M src/components/app-dialog.tsx
?? src/services/updateService.ts
```
(La bozza scritta prima del brainstorming. Se compaiono altri file modificati, fermati e chiedi.)

- [ ] **Step 2: Scarta la bozza (verrà riscritta dai task successivi)**

Run:
```bash
git checkout -- src/app/_layout.tsx src/components/app-dialog.tsx
rm src/services/updateService.ts
git status --short
```
Expected: nessun output.

- [ ] **Step 3: Installa le dipendenze nel worktree**

Run: `npm ci`
Expected: termina senza errori (`added N packages`).

---

### Task 1: versionCode derivato dalla versione

**Files:**
- Create: `app.config.js`
- Create: `app.config.test.mjs`
- Modify: `app.json` (righe 5 e 15)
- Modify: `package.json` (sezione `scripts`)

- [ ] **Step 1: Aggiungi lo script di test a `package.json`**

Nella sezione `"scripts"` aggiungi dopo `"lint": "expo lint"`:
```json
    "lint": "expo lint",
    "test": "node --test app.config.test.mjs src/services/updateRelease.test.mjs"
```

- [ ] **Step 2: Scrivi il test che fallisce** — `app.config.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const makeConfig = require('./app.config.js');
const { versionCodeFrom } = makeConfig;

test('versionCode = major*10000 + minor*100 + patch', () => {
  assert.equal(versionCodeFrom('2.6.5'), 20605);
  assert.equal(versionCodeFrom('2.7.0'), 20700);
  assert.equal(versionCodeFrom('3.0.0'), 30000);
});

test('versionCode cresce sempre con la versione', () => {
  assert.ok(versionCodeFrom('2.6.10') > versionCodeFrom('2.6.9'));
  assert.ok(versionCodeFrom('2.7.0') > versionCodeFrom('2.6.99'));
  assert.ok(versionCodeFrom('2.6.5') > 2); // versionCode attualmente installato
});

test('rifiuta versioni non rappresentabili', () => {
  for (const v of ['', '2.6', '2.6.5-beta', '2.100.0', '2.6.100', 'v2.6.5']) {
    assert.throws(() => versionCodeFrom(v), /versione non valida/, v);
  }
});

test('la config mantiene i campi android esistenti', () => {
  const out = makeConfig({ config: { version: '2.6.5', android: { package: 'it.cuscosenza.app' } } });
  assert.equal(out.android.versionCode, 20605);
  assert.equal(out.android.package, 'it.cuscosenza.app');
  assert.equal(out.version, '2.6.5');
});
```

- [ ] **Step 3: Esegui il test e verifica che fallisca**

Run: `node --test app.config.test.mjs`
Expected: FAIL con `Cannot find module './app.config.js'`.

- [ ] **Step 4: Implementa** — `app.config.js`

```js
// La versione è scritta da release-please in app.json (expo.version).
// versionCode ne deriva: major*10000 + minor*100 + patch, sempre crescente finché minor e patch restano < 100.
function versionCodeFrom(version) {
  const parts = String(version).split('.');
  const numbers = parts.map(Number);
  const valid =
    parts.length === 3 &&
    numbers.every((n) => Number.isInteger(n) && n >= 0) &&
    numbers[1] < 100 &&
    numbers[2] < 100;
  if (!valid) {
    throw new Error(`[app.config] versione non valida per versionCode: "${version}"`);
  }
  return numbers[0] * 10000 + numbers[1] * 100 + numbers[2];
}

module.exports = ({ config }) => ({
  ...config,
  android: { ...config.android, versionCode: versionCodeFrom(config.version) },
});
module.exports.versionCodeFrom = versionCodeFrom;
```

Nota: `Number('')` è `0` ma `''.split('.')` ha lunghezza 1, quindi `''` viene rifiutata; `'v2'` dà `NaN`.

- [ ] **Step 5: Esegui il test e verifica che passi**

Run: `node --test app.config.test.mjs`
Expected: `ℹ pass 4`, `ℹ fail 0`.

- [ ] **Step 6: Aggiorna `app.json`**

Riga 5: `"version": "1.0.0",` → `"version": "2.6.5",`
Rimuovi la riga 15: `"versionCode": 2,`

- [ ] **Step 7: Verifica la config risolta da Expo**

Run: `npx expo config --type public --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s);console.log(c.version,c.android.versionCode)})"`
Expected: `2.6.5 20605`

- [ ] **Step 8: Commit**

```bash
git add app.config.js app.config.test.mjs app.json package.json
git commit -m "feat(release): versionCode derivato dalla versione, versione 2.6.5"
```

---

### Task 2: Logica pura degli aggiornamenti

**Files:**
- Create: `src/services/updateRelease.ts`
- Create: `src/services/updateRelease.test.mjs`

Vincolo: `updateRelease.ts` non importa nulla (deve girare in Node puro) e usa solo sintassi TypeScript "cancellabile" (niente `enum`, niente `namespace`, tipi importati con `import type`).

- [ ] **Step 1: Scrivi il test che fallisce** — `src/services/updateRelease.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, isNewer, cleanNotes, parseRelease } from './updateRelease.ts';

const APK_URL = 'https://github.com/mariocostabile/CusApp/releases/download/v2.7.0/CusCosenza-v2.7.0.apk';

const RELEASE_BODY = [
  '## [2.7.0](https://github.com/mariocostabile/CusApp/compare/v2.6.5...v2.7.0) (2026-11-02)',
  '',
  '',
  '### Novità',
  '',
  '* nuovo calendario partite ([a1b2c3d](https://github.com/mariocostabile/CusApp/commit/a1b2c3d4e5f6))',
  '',
  '',
  '### Correzioni',
  '',
  "* **login:** risolto crash all'avvio ([1234abc](https://github.com/mariocostabile/CusApp/commit/1234abcdef))",
].join('\n');

function release(overrides = {}) {
  return {
    tag_name: 'v2.7.0',
    draft: false,
    prerelease: false,
    body: RELEASE_BODY,
    assets: [{ name: 'CusCosenza-v2.7.0.apk', browser_download_url: APK_URL }],
    ...overrides,
  };
}

test('parseVersion accetta X.Y.Z con o senza v', () => {
  assert.deepEqual(parseVersion('2.6.5'), [2, 6, 5]);
  assert.deepEqual(parseVersion('v2.7.0'), [2, 7, 0]);
  assert.equal(parseVersion('2.6'), null);
  assert.equal(parseVersion('latest-beta'), null);
});

test('isNewer confronta numericamente', () => {
  assert.equal(isNewer('v2.7.0', '2.6.5'), true);
  assert.equal(isNewer('v2.6.10', '2.6.9'), true);
  assert.equal(isNewer('v2.6.5', '2.6.5'), false);
  assert.equal(isNewer('v2.6.4', '2.6.5'), false);
  assert.equal(isNewer('garbage', '2.6.5'), false);
});

test('cleanNotes toglie titolo, hash e markdown di release-please', () => {
  assert.equal(
    cleanNotes(RELEASE_BODY),
    "Novità:\n\n• nuovo calendario partite\n\nCorrezioni:\n\n• login: risolto crash all'avvio",
  );
});

test('cleanNotes rimuove il marcatore e tronca le note lunghe', () => {
  assert.equal(cleanNotes('* fix\n\n[obbligatorio]'), '• fix');
  const long = cleanNotes('* ' + 'a'.repeat(500));
  assert.equal(long.length, 401);
  assert.ok(long.endsWith('…'));
});

test('parseRelease restituisce l\'aggiornamento se la versione è più nuova', () => {
  assert.deepEqual(parseRelease(release(), '2.6.5'), {
    version: '2.7.0',
    notes: "Novità:\n\n• nuovo calendario partite\n\nCorrezioni:\n\n• login: risolto crash all'avvio",
    apkUrl: APK_URL,
    mandatory: false,
  });
});

test('parseRelease riconosce [obbligatorio] senza distinguere maiuscole', () => {
  const update = parseRelease(release({ body: RELEASE_BODY + '\n\n[OBBLIGATORIO]' }), '2.6.5');
  assert.equal(update.mandatory, true);
  assert.ok(!update.notes.includes('OBBLIGATORIO'));
});

test('parseRelease ignora versioni uguali o più vecchie', () => {
  assert.equal(parseRelease(release(), '2.7.0'), null);
  assert.equal(parseRelease(release(), '2.8.0'), null);
});

test('parseRelease rifiuta APK fuori dal repo, release senza APK, bozze e prerelease', () => {
  const foreign = [{ name: 'x.apk', browser_download_url: 'https://evil.example/x.apk' }];
  assert.equal(parseRelease(release({ assets: foreign }), '2.6.5'), null);
  assert.equal(parseRelease(release({ assets: [] }), '2.6.5'), null);
  assert.equal(parseRelease(release({ assets: undefined }), '2.6.5'), null);
  assert.equal(parseRelease(release({ draft: true }), '2.6.5'), null);
  assert.equal(parseRelease(release({ prerelease: true }), '2.6.5'), null);
});

test('parseRelease tollera risposte inattese', () => {
  assert.equal(parseRelease(null, '2.6.5'), null);
  assert.equal(parseRelease('oops', '2.6.5'), null);
  assert.equal(parseRelease({ message: 'API rate limit exceeded' }, '2.6.5'), null);
  assert.equal(parseRelease(release({ assets: [null, { name: 1 }] }), '2.6.5'), null);
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `node --test src/services/updateRelease.test.mjs`
Expected: FAIL con `Cannot find module` per `updateRelease.ts`.

- [ ] **Step 3: Implementa** — `src/services/updateRelease.ts`

```ts
// Logica pura del controllo aggiornamenti: nessun import, testabile con `node --test`.

export const REPO_DOWNLOAD_PREFIX = 'https://github.com/mariocostabile/CusApp/releases/download/';
const MANDATORY_MARKER = /\[obbligatorio\]/i;
const MANDATORY_MARKER_ALL = /\[obbligatorio\]/gi;
const MAX_NOTES_LENGTH = 400;

export type AvailableUpdate = {
  version: string;
  notes: string;
  apkUrl: string;
  mandatory: boolean;
};

type ReleaseAsset = { name?: unknown; browser_download_url?: unknown } | null;

export function parseVersion(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isNewer(remote: string, local: string): boolean {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  if (!r || !l) return false;
  for (let i = 0; i < 3; i++) {
    if (r[i] !== l[i]) return r[i] > l[i];
  }
  return false;
}

/** Trasforma il corpo markdown di release-please in testo semplice per il popup. */
export function cleanNotes(body: string): string {
  const text = body
    .replace(MANDATORY_MARKER_ALL, '')
    .split(/\r?\n/)
    .filter((line) => !/^#{1,2}\s/.test(line)) // titolo "## [2.7.0](...) (data)"
    .map((line) =>
      line
        .replace(/^###\s*(.+)$/, '$1:') // "### Novità" -> "Novità:"
        .replace(/\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)/gi, '') // " ([a1b2c3d](url))"
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // link markdown -> testo
        .replace(/\*\*/g, '')
        .replace(/^\s*[*-]\s+/, '• ')
        .trimEnd(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > MAX_NOTES_LENGTH ? `${text.slice(0, MAX_NOTES_LENGTH)}…` : text;
}

/** Valida la risposta di GitHub `releases/latest`. Restituisce null se non c'è nulla da installare. */
export function parseRelease(release: unknown, currentVersion: string): AvailableUpdate | null {
  if (typeof release !== 'object' || release === null) return null;
  const { tag_name: tag, body, assets, draft, prerelease } = release as Record<string, unknown>;
  if (typeof tag !== 'string' || draft === true || prerelease === true) return null;

  const version = parseVersion(tag);
  if (!version || !isNewer(tag, currentVersion)) return null;

  const apk = Array.isArray(assets)
    ? (assets as ReleaseAsset[]).find((asset) => {
        const name = asset?.name;
        return typeof name === 'string' && name.endsWith('.apk');
      })
    : undefined;
  const apkUrl = apk?.browser_download_url;
  // Apriamo solo download del nostro repo, mai URL arbitrari presi dalla risposta.
  if (typeof apkUrl !== 'string' || !apkUrl.startsWith(REPO_DOWNLOAD_PREFIX)) return null;

  const text = typeof body === 'string' ? body : '';
  return {
    version: version.join('.'),
    notes: cleanNotes(text),
    apkUrl,
    mandatory: MANDATORY_MARKER.test(text),
  };
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `node --test src/services/updateRelease.test.mjs`
Expected: `ℹ pass 9`, `ℹ fail 0`.

- [ ] **Step 5: Esegui tutta la suite**

Run: `npm test`
Expected: `ℹ pass 13`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/services/updateRelease.ts src/services/updateRelease.test.mjs
git commit -m "feat(update): logica di confronto versioni e parsing delle release"
```

---

### Task 3: Controllo aggiornamenti (fetch)

**Files:**
- Create: `src/services/updateService.ts`

- [ ] **Step 1: Implementa** — `src/services/updateService.ts`

```ts
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { parseRelease, type AvailableUpdate } from './updateRelease';

export type { AvailableUpdate } from './updateRelease';

// Repo pubblico: nessun token. Limite GitHub 60 richieste/ora per IP, sufficiente per un controllo all'avvio.
const LATEST_RELEASE_URL = 'https://api.github.com/repos/mariocostabile/CusApp/releases/latest';

/** Restituisce l'aggiornamento disponibile, oppure null (anche in caso di errore: l'app parte normalmente). */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (Platform.OS !== 'android' || __DEV__) return null;

  const currentVersion = Constants.expoConfig?.version;
  if (!currentVersion) return null;

  try {
    const res = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    return parseRelease(await res.json(), currentVersion);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/services/updateService.ts
git commit -m "feat(update): controllo di releases/latest all'avvio"
```

---

### Task 4: Download e installazione dell'APK

**Files:**
- Modify: `package.json` (dipendenze, via `expo install`)
- Modify: `app.json` (`android.permissions`)
- Create: `src/services/updateInstaller.ts`

- [ ] **Step 1: Installa i moduli con le versioni compatibili con l'SDK 57**

Run: `npx expo install expo-file-system expo-intent-launcher`
Expected: `package.json` contiene `"expo-file-system": "~57.0.x"` e `"expo-intent-launcher": "~57.0.x"` (o la serie indicata da Expo per l'SDK 57).

- [ ] **Step 2: Aggiungi il permesso di installazione in `app.json`**

In `expo.android`, subito prima di `"blockedPermissions"`, aggiungi:
```json
      "permissions": [
        "android.permission.REQUEST_INSTALL_PACKAGES"
      ],
```

- [ ] **Step 3: Implementa** — `src/services/updateInstaller.ts`

```ts
import { File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import type { AvailableUpdate } from './updateRelease';

const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const FLAG_GRANT_READ_URI_PERMISSION = 1; // android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION

/**
 * Scarica l'APK nella cache e apre l'installer di Android.
 * onProgress riceve una frazione 0..1, oppure null se il server non indica la dimensione.
 * Al primo utilizzo Android chiede all'utente di consentire a CusApp di installare app sconosciute.
 */
export async function downloadAndInstall(
  update: AvailableUpdate,
  onProgress: (fraction: number | null) => void,
): Promise<void> {
  const destination = new File(Paths.cache, `CusCosenza-${update.version}.apk`);
  const apk = await File.downloadFileAsync(update.apkUrl, destination, {
    idempotent: true,
    onProgress: ({ bytesWritten, totalBytes }) =>
      onProgress(totalBytes > 0 ? bytesWritten / totalBytes : null),
  });

  await startActivityAsync('android.intent.action.VIEW', {
    data: apk.contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore. Se `contentUri` non risulta nel tipo `File`, verifica in `node_modules/expo-file-system/build/internal/NativeFileSystem.types.d.ts` (proprietà `contentUri: string`, solo Android) e che l'import sia da `'expo-file-system'` e non da `'expo-file-system/legacy'`.

- [ ] **Step 5: Verifica il permesso nella config risolta**

Run: `npx expo config --type public --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s);console.log(c.android.permissions)})"`
Expected: l'array contiene `android.permission.REQUEST_INSTALL_PACKAGES`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app.json src/services/updateInstaller.ts
git commit -m "feat(update): download dell'APK e apertura dell'installer"
```

---

### Task 5: Estensioni retrocompatibili di AppDialog

**Files:**
- Modify: `src/components/app-dialog.tsx:4-49`

Gli usi esistenti (`src/app/index.tsx:1979`) non passano le nuove prop e devono comportarsi come prima.

- [ ] **Step 1: Aggiungi `keepOpen` all'azione e `icon`/`dismissible` alle prop**

Sostituisci le righe 4-27 con:
```tsx
export type AppDialogAction = {
  label: string;
  variant: 'danger' | 'secondary';
  onPress?: () => void;
  /** Se true il pulsante non chiude il dialog (default: chiude, poi esegue onPress). */
  keepOpen?: boolean;
};

type AppDialogProps = {
  visible: boolean;
  title: string;
  message: ReactNode;
  actions: AppDialogAction[];
  onClose: () => void;
  icon?: string;
  /** Se false il tasto indietro di Android non chiude il dialog. */
  dismissible?: boolean;
};

export function AppDialog({
  visible,
  title,
  message,
  actions,
  onClose,
  icon = '⚠️',
  dismissible = true,
}: AppDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent={true}
      navigationBarTranslucent={true}
      onRequestClose={dismissible ? onClose : () => {}}
    >
```

- [ ] **Step 2: Usa `icon` e `keepOpen` nel corpo**

Sostituisci `<Text style={styles.iconEmoji}>⚠️</Text>` con:
```tsx
            <Text style={styles.iconEmoji}>{icon}</Text>
```
Sostituisci il blocco `onPress` del pulsante:
```tsx
                  onPress={() => {
                    if (!action.keepOpen) onClose();
                    action.onPress?.();
                  }}
```

- [ ] **Step 3: Type-check e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-dialog.tsx
git commit -m "feat(dialog): icona personalizzabile, dialog non chiudibile e azioni che non chiudono"
```

---

### Task 6: Popup di aggiornamento

**Files:**
- Create: `src/components/update-prompt.tsx`
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Implementa** — `src/components/update-prompt.tsx`

```tsx
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { AppDialog, type AppDialogAction } from '@/components/app-dialog';
import { checkForUpdate, type AvailableUpdate } from '@/services/updateService';
import { downloadAndInstall } from '@/services/updateInstaller';

type Phase =
  | { kind: 'ready' }
  | { kind: 'downloading'; progress: number | null }
  | { kind: 'failed' };

export function UpdatePrompt() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });

  useEffect(() => {
    checkForUpdate().then(setUpdate);
  }, []);

  if (!update) return null;

  const downloading = phase.kind === 'downloading';
  const dismissible = !update.mandatory && !downloading;

  const install = async () => {
    setPhase({ kind: 'downloading', progress: 0 });
    try {
      await downloadAndInstall(update, (progress) => setPhase({ kind: 'downloading', progress }));
      // Se l'utente annulla l'installer, il popup torna disponibile.
      setPhase({ kind: 'ready' });
    } catch {
      setPhase({ kind: 'failed' });
    }
  };

  const later: AppDialogAction[] = dismissible ? [{ label: 'Più tardi', variant: 'secondary' }] : [];
  let message: string;
  let actions: AppDialogAction[];

  if (phase.kind === 'downloading') {
    message =
      phase.progress === null
        ? 'Download in corso…'
        : `Download ${Math.round(phase.progress * 100)}%…`;
    actions = [];
  } else if (phase.kind === 'failed') {
    message = "Download o installazione non riusciti. Riprova oppure scarica l'APK dal browser.";
    actions = [
      { label: 'Riprova', variant: 'danger', keepOpen: true, onPress: install },
      {
        label: 'Apri nel browser',
        variant: 'secondary',
        keepOpen: true,
        onPress: () => Linking.openURL(update.apkUrl),
      },
      ...later,
    ];
  } else {
    message = `${update.notes || "È disponibile una nuova versione dell'app."}\n\nSe Android lo chiede, consenti a CusApp di installare app sconosciute.`;
    actions = [{ label: 'Aggiorna ora', variant: 'danger', keepOpen: true, onPress: install }, ...later];
  }

  return (
    <AppDialog
      visible
      icon="🚀"
      title={`${update.mandatory ? 'Aggiornamento obbligatorio' : 'Nuova versione'} ${update.version}`}
      message={message}
      actions={actions}
      dismissible={dismissible}
      onClose={() => {
        if (dismissible) setUpdate(null);
      }}
    />
  );
}
```

- [ ] **Step 2: Monta il componente** — `src/app/_layout.tsx`

Sostituisci l'intero file con:
```tsx
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LogBox } from 'react-native';
import { UpdatePrompt } from '@/components/update-prompt';

LogBox.ignoreLogs([
  'Cannot connect to Expo CLI',
  '[GinnipalService]',
]);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Slot />
      <UpdatePrompt />
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 3: Type-check, lint e test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: nessun errore, `ℹ fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/components/update-prompt.tsx src/app/_layout.tsx
git commit -m "feat(update): popup di aggiornamento all'avvio"
```

---

### Task 7: Configurazione di release-please

**Files:**
- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`
- Create: `version.txt`

- [ ] **Step 1: Crea `release-please-config.json`**

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "bootstrap-sha": "f7bb5053b5f97ac3cfb72146a59414627a875663",
  "packages": {
    ".": {
      "release-type": "simple",
      "package-name": "CusApp",
      "changelog-path": "CHANGELOG.md",
      "changelog-sections": [
        { "type": "feat", "section": "Novità" },
        { "type": "fix", "section": "Correzioni" },
        { "type": "perf", "section": "Miglioramenti" }
      ],
      "extra-files": [
        { "type": "json", "path": "app.json", "jsonpath": "$.expo.version" }
      ]
    }
  }
}
```

- [ ] **Step 2: Crea `.release-please-manifest.json`**

```json
{
  ".": "2.6.5"
}
```

- [ ] **Step 3: Crea `version.txt`**

Contenuto (una riga, con a capo finale):
```
2.6.5
```

- [ ] **Step 4: Verifica che i JSON siano validi e coerenti con `app.json`**

Run: `node -e "const m=require('./.release-please-manifest.json'),a=require('./app.json'),c=require('./release-please-config.json');if(m['.']!==a.expo.version)throw new Error('versioni diverse');console.log('ok',m['.'],c.packages['.']['release-type'])"`
Expected: `ok 2.6.5 simple`

- [ ] **Step 5: Commit**

```bash
git add release-please-config.json .release-please-manifest.json version.txt
git commit -m "ci(release): configurazione release-please da 2.6.5"
```

---

### Task 8: Workflow di rilascio

**Files:**
- Create: `.github/workflows/release.yml`

Azioni fissate a SHA come in `sync-crowd.yml`: checkout `11d5960a…` (v4.4.0), setup-node `49933ea5…` (v4.4.0), setup-java `b843ebf9b913146b38da2eaa7aeddf76074ae1ad` (v6.1.0), release-please-action `45996ed1f6d02564a971a2fa1b5860e934307cf7` (v5.0.0).

- [ ] **Step 1: Crea `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches:
      - master

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
    steps:
      - name: Release Please
        id: release
        uses: googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7 # v5.0.0
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

  # Deve stare in questo workflow: una release creata con GITHUB_TOKEN non avvia altri workflow.
  build-apk:
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    env:
      TAG: ${{ needs.release-please.outputs.tag_name }}
    steps:
      - name: Checkout tag
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          ref: ${{ needs.release-please.outputs.tag_name }}

      - name: Setup Node.js
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '24'
          cache: npm

      - name: Setup Java 17
        uses: actions/setup-java@b843ebf9b913146b38da2eaa7aeddf76074ae1ad # v6.1.0
        with:
          distribution: temurin
          java-version: '17'

      - name: Install dependencies
        run: npm ci

      - name: Decode keystore
        env:
          KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
        run: |
          if [ -z "$KEYSTORE_BASE64" ]; then
            echo "::error::Secret KEYSTORE_BASE64 mancante"
            exit 1
          fi
          echo "$KEYSTORE_BASE64" | base64 --decode > "$RUNNER_TEMP/release.keystore"

      - name: Expo prebuild
        run: npx expo prebuild -p android --clean --no-install

      - name: Build release APK
        working-directory: android
        env:
          ORG_GRADLE_PROJECT_CUSAPP_UPLOAD_STORE_FILE: ${{ runner.temp }}/release.keystore
          ORG_GRADLE_PROJECT_CUSAPP_UPLOAD_STORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          ORG_GRADLE_PROJECT_CUSAPP_UPLOAD_KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          ORG_GRADLE_PROJECT_CUSAPP_UPLOAD_KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew assembleRelease --no-daemon

      - name: Upload APK to release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          cp android/app/build/outputs/apk/release/app-release.apk "CusCosenza-$TAG.apk"
          gh release upload "$TAG" "CusCosenza-$TAG.apk" --clobber

      - name: Remove keystore
        if: always()
        run: rm -f "$RUNNER_TEMP/release.keystore"
```

- [ ] **Step 2: Verifica la sintassi YAML**

Run: `npx --yes yaml@2.8.1 valid < .github/workflows/release.yml && echo valid`
Expected: `valid` (nessun errore di parsing).

- [ ] **Step 3: Controlla che nessun segreto sia scritto in chiaro**

Run: `grep -nE "password|keystore" .github/workflows/release.yml`
Expected: compaiono solo riferimenti `${{ secrets.* }}`, `$KEYSTORE_BASE64` e `$RUNNER_TEMP/release.keystore`; nessun valore letterale.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): workflow release-please e build firmata dell'APK"
```

---

### Task 9: Documentazione della configurazione iniziale

**Files:**
- Modify: `docs/RELEASING.md` (nuova sezione dopo "Come arrivano gli aggiornamenti agli utenti")

- [ ] **Step 1: Aggiungi la sezione**

Inserisci prima di `## Pubblicare un aggiornamento`:
````markdown
## Configurazione iniziale (una tantum, la fa l'utente)

1. **Secrets** — GitHub → Settings → Secrets and variables → Actions → New repository secret:
   - `KEYSTORE_BASE64`: il keystore indicato da `CUSAPP_UPLOAD_STORE_FILE` in `~/.gradle/gradle.properties`,
     convertito in base64 (PowerShell):
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\percorso\del\keystore.jks")) | Set-Clipboard
     ```
   - `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`: i valori `CUSAPP_UPLOAD_STORE_PASSWORD`,
     `CUSAPP_UPLOAD_KEY_ALIAS`, `CUSAPP_UPLOAD_KEY_PASSWORD` dello stesso file.
2. **Permessi Actions** — Settings → Actions → General → Workflow permissions:
   attiva "Allow GitHub Actions to create and approve pull requests" (serve a release-please).
3. **Ultimo invio manuale** — gli utenti con la 2.6.5 senza controllo aggiornamenti ricevono a mano
   l'APK della prima release automatica; dalle successive arriva il popup.

Le release pubblicate prima che l'APK sia allegato (il job `build-apk` dura alcuni minuti) vengono ignorate
dall'app: `parseRelease` richiede un asset `.apk` del repo.
````

- [ ] **Step 2: Aggiungi i nuovi file alla sezione "Regole da non violare"**

Aggiungi in fondo alla lista:
```markdown
- **File di release-please**: `release-please-config.json`, `.release-please-manifest.json`, `version.txt`,
  `CHANGELOG.md` sono gestiti dal bot. Modificali solo per cambiare la configurazione, mai la versione.
- **Test**: `npm test` (Node, nessun jest) copre `app.config.js` e `src/services/updateRelease.ts`;
  tienili verdi prima di ogni merge.
```

- [ ] **Step 3: Commit**

```bash
git add docs/RELEASING.md
git commit -m "docs(release): configurazione iniziale di secrets e permessi"
```

---

### Task 10: Verifica finale e push del branch

- [ ] **Step 1: Suite completa**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: `ℹ fail 0`, nessun errore di tipi o lint.

- [ ] **Step 2: Config Expo risolta**

Run: `npx expo config --type public --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s);console.log(c.version,c.android.versionCode,c.android.permissions.includes('android.permission.REQUEST_INSTALL_PACKAGES'))})"`
Expected: `2.6.5 20605 true`

- [ ] **Step 3: Push del branch (mai su master)**

```bash
git push origin worktree-in-app-update
```

- [ ] **Step 4: Verifica manuale lasciata all'utente (dopo la configurazione iniziale e il merge su `master`)**

Documentare nel report finale, senza eseguirla:
1. Build locale `npm run build:apk` e installazione sul telefono (versione 2.6.5, versionCode 20605).
2. Commit `fix:` di prova su master → si apre la Release PR `chore(master): release 2.6.6`.
3. Merge della Release PR → `gh release view v2.6.6 -R mariocostabile/CusApp` elenca `CusCosenza-v2.6.6.apk`.
4. Riaprire l'app: popup "Nuova versione 2.6.6" → "Aggiorna ora" → avanzamento → permesso "app sconosciute"
   → installazione sopra l'app esistente.
5. Aggiungere `[obbligatorio]` alla release (vedi `docs/RELEASING.md`) e verificare che il popup non si chiuda.
6. Modalità aereo all'avvio: nessun popup, nessun crash.
