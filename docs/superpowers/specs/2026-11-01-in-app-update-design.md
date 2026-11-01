# Aggiornamenti in-app via GitHub Releases — Design

Data: 2026-11-01 · Branch: `worktree-in-app-update`

## Obiettivo

Smettere di inviare l'APK a mano. Ogni release viene compilata e pubblicata da GitHub;
l'app, all'avvio, mostra un popup, scarica l'APK e apre l'installer di Android.
Nessuno store: solo GitHub ↔ telefono (stesso modello di SpotiDuck, che interroga
`api.github.com/repos/<owner>/<repo>/releases/latest`).

## Decisioni

| Tema | Scelta |
|---|---|
| Distribuzione | GitHub Releases del repo pubblico `mariocostabile/CusApp` (nessun repo separato) |
| Versionamento | release-please (Conventional Commits, già in uso nei commit) |
| Build | GitHub Actions, firma con i Secrets del repo |
| Popup | Facoltativo; obbligatorio se le note della release contengono `[obbligatorio]` |
| Installazione | Download e installer in-app con moduli Expo |
| Versione di partenza | `2.6.5` (versione reale attuale; `app.json` oggi dice `1.0.0`) |

## 1. Pubblicazione

### Flusso
1. Commit su branch con prefissi `feat:` / `fix:` / `feat!:` (gli altri tipi non generano rilascio).
2. Merge su `master` → release-please apre/aggiorna la Release PR (`chore(master): release X.Y.Z`)
   con `app.json` e `CHANGELOG.md` aggiornati.
3. Merge della Release PR → tag `vX.Y.Z` + GitHub Release con note → build e upload dell'APK.
4. Per un aggiornamento obbligatorio si aggiunge `[obbligatorio]` al corpo della release
   (prima o dopo la pubblicazione: l'app legge il corpo a ogni controllo).

### File
- `.github/workflows/release.yml`, trigger `push` su `master`, `permissions: contents: write, pull-requests: write`.
  - Job `release-please` (`googleapis/release-please-action@v4`, versione fissata a SHA come in `sync-crowd.yml`);
    output `release_created`, `tag_name`.
  - Job `build-apk` (`needs: release-please`, `if: release_created == 'true'`; deve stare nello stesso
    workflow perché una release creata con `GITHUB_TOKEN` non avvia altri workflow):
    checkout del tag → Node 24 + JDK 17 → `npm ci` → keystore da `KEYSTORE_BASE64` in un file temporaneo →
    `ORG_GRADLE_PROJECT_CUSAPP_UPLOAD_STORE_FILE|STORE_PASSWORD|KEY_ALIAS|KEY_PASSWORD` →
    `npx expo prebuild -p android --clean` → `./gradlew assembleRelease` →
    `gh release upload <tag> CusCosenza-<tag>.apk`.
    Il keystore viene eliminato a fine job; se un secret manca il job fallisce (nessun APK firmato con chiave debug,
    già garantito da `withReleaseSigning`).
- `release-please-config.json`: `release-type: simple`, `extra-files` con
  `{ "type": "json", "path": "app.json", "jsonpath": "$.expo.version" }`.
- `.release-please-manifest.json`: `{ ".": "2.6.5" }`.
- `app.json`: `version` → `2.6.5`; rimosso `android.versionCode`.
- `app.config.js` (nuovo): legge `app.json` e calcola
  `android.versionCode = major*10000 + minor*100 + patch` (2.6.5 → 20605, > attuale 2).
  Vincolo: minor e patch < 100.

### Secrets (una tantum, Settings → Secrets → Actions)
`KEYSTORE_BASE64` (il keystore attuale, lo stesso usato finora — altrimenti Android rifiuta l'aggiornamento),
`KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. Backup del keystore fuori da GitHub.

`build-apk.ps1` resta per le build locali.

## 2. Controllo aggiornamenti

`src/services/updateService.ts` — `checkForUpdate(): Promise<AvailableUpdate | null>`
con `AvailableUpdate = { version, notes, apkUrl, mandatory }`.

- Attivo solo con `Platform.OS === 'android'` e `!__DEV__`.
- `GET https://api.github.com/repos/mariocostabile/CusApp/releases/latest` (pubblico, senza token;
  limite 60 richieste/ora per IP, sufficiente per un controllo all'avvio).
- Versione locale: `Constants.expoConfig.version`; confronto numerico semver su `tag_name` (prefisso `v` ignorato).
- Asset: primo file `.apk`; accettato solo se `browser_download_url` inizia con
  `https://github.com/mariocostabile/CusApp/releases/download/`.
- `mandatory`: il corpo contiene `[obbligatorio]` (case-insensitive).
- `notes`: corpo senza il marcatore, senza link markdown/hash commit di release-please, max ~400 caratteri.
- Qualsiasi errore (rete, HTTP non 2xx, JSON inatteso) → `null`: l'app parte normalmente.

## 3. Popup

In `src/app/_layout.tsx`, controllo una volta al mount, mostrato sopra `<Slot />` con `AppDialog`.

`AppDialog` riceve due prop opzionali retrocompatibili: `icon` (default `⚠️`) e
`dismissible` (default `true`; se `false`, `onRequestClose`/tasto indietro non chiudono).

- Facoltativo: titolo "Nuova versione X.Y.Z", note, pulsanti "Aggiorna ora" / "Più tardi".
  Ricompare al prossimo avvio finché non si aggiorna.
- Obbligatorio: solo "Aggiorna ora", non chiudibile.
- Durante il download: pulsanti disabilitati, testo "Download NN%".
- Errore download/installer: messaggio + pulsante "Apri nel browser" (`Linking.openURL(apkUrl)`).

## 4. Download e installazione

`src/services/updateInstaller.ts` — `downloadAndInstall(update, onProgress)`.

- `expo-file-system`: download in cache come `CusCosenza-<version>.apk` con avanzamento;
  file precedente sovrascritto.
- URI `content://` dal file in cache (FileProvider fornito da expo-file-system).
- `expo-intent-launcher`: `android.intent.action.VIEW`, `type: application/vnd.android.package-archive`,
  flag `FLAG_GRANT_READ_URI_PERMISSION`.
- `app.json` → `android.permissions`: `android.permission.REQUEST_INSTALL_PACKAGES`.
- Al primo aggiornamento Android chiede di consentire a CusApp di "installare app sconosciute";
  il popup lo anticipa con una riga di testo.
- Le librerie sono compilate nell'APK: gli utenti non installano nulla oltre all'app.

## Migrazione

Gli utenti attuali (2.6.5 senza controllo) ricevono a mano un'ultima volta la prima release che
contiene questa funzione; dalle successive arriva il popup.

## Test

- Unit test della logica pura di `updateService` (confronto versioni, validazione URL, `[obbligatorio]`,
  pulizia note) — la suite jest-expo è rinviata, quindi le funzioni pure restano esportate e testabili;
  verifica minima con uno script node o `tsc`/lint.
- `npm run lint` + `npx tsc --noEmit`.
- End-to-end manuale: installare la prima release, pubblicare una patch di prova, verificare popup,
  download, permesso, installazione sopra l'app esistente, caso `[obbligatorio]`, caso offline.

## Fuori scope

iOS, aggiornamenti OTA del solo JS (expo-updates), canali beta, statistiche di adozione.
