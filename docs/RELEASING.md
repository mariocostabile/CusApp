# CusApp — Rilasci e aggiornamenti in-app

App Expo / React Native (Android) distribuita come APK fuori dagli store.
Design completo degli aggiornamenti: `docs/superpowers/specs/2026-11-01-in-app-update-design.md`.

> Stato: la pipeline di rilascio è in sviluppo sul branch `worktree-in-app-update`.
> Finché `.github/workflows/release.yml` non è su `master`, i rilasci restano manuali
> (`npm run build:apk` → `dist-apk/CusCosenza.apk`). Aggiorna questa nota quando viene fatto il merge.

## Come arrivano gli aggiornamenti agli utenti

GitHub Releases di `mariocostabile/CusApp` (repo pubblico) → l'app all'avvio interroga
`api.github.com/repos/mariocostabile/CusApp/releases/latest`, confronta il tag con la propria
versione, mostra un popup, scarica l'APK e apre l'installer di Android. Nessuno store.

Codice: `src/services/updateRelease.ts` (logica pura), `updateService.ts` (fetch), `updateInstaller.ts`
(download + installer), `src/components/update-prompt.tsx` (popup, basato su `AppDialog`),
`.github/workflows/release.yml` (release-please + build firmata).

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

## Compilare un APK senza rilasciare (build su GitHub)

Preferisci GitHub alla build locale (`npm run build:apk`): fa risparmiare batteria e prova i Secrets.
`.github/workflows/build-apk.yml` si avvia a mano e produce un APK firmato come artifact (7 giorni),
**senza** creare una release, quindi i tester non vedono nessun popup.

```bash
gh workflow run build-apk.yml -R mariocostabile/CusApp --ref master
gh run list -R mariocostabile/CusApp --workflow build-apk.yml --limit 1   # prendi l'ID
gh run watch <ID> -R mariocostabile/CusApp --exit-status
gh run download <ID> -R mariocostabile/CusApp -D dist-apk
```
Lo stesso workflow è richiamato da `release.yml` (con `tag`) per allegare l'APK alla release: i passi di
build esistono solo in `build-apk.yml`.

## Pubblicare un aggiornamento

Il versionamento è gestito da **release-please**: non modificare mai a mano la versione.

1. Lavora su un branch, commit in **Conventional Commits**:
   - `fix: ...` → patch (2.6.5 → 2.6.6)
   - `feat: ...` → minor (2.6.5 → 2.7.0)
   - `feat!: ...` o footer `BREAKING CHANGE:` → major
   - `chore:`, `docs:`, `refactor:`, `style:`, `test:`, `ci:` → nessun rilascio
   I messaggi `fix`/`feat` finiscono nelle note del popup: scrivili in italiano, chiari per l'utente finale.
2. Merge su `master` (solo con il consenso dell'utente), sempre **squash** (`gh pr merge <n> --squash`): il repo
   accetta solo squash con il titolo della PR come messaggio. Un merge commit ripeterebbe il titolo `fix:`/`feat:`
   e release-please lo conterebbe due volte. Il titolo della PR diventa la riga nelle note del popup.
   release-please apre o aggiorna la Release PR `chore(master): release X.Y.Z`.
3. Rilascio = merge della Release PR (solo su richiesta esplicita dell'utente). Il workflow crea il tag
   `vX.Y.Z`, la GitHub Release e allega `CusCosenza-vX.Y.Z.apk` firmato.
4. Verifica: `gh release view vX.Y.Z -R mariocostabile/CusApp` deve elencare un asset `.apk`.
   Se manca, controlla il job `build-apk / build` con `gh run list -R mariocostabile/CusApp --workflow release.yml`.

Aggiornamento **obbligatorio** (popup non chiudibile): aggiungi `[obbligatorio]` al corpo della release,
es.:
```bash
gh release view vX.Y.Z -R mariocostabile/CusApp --json body -q .body > notes.md
printf '\n\n[obbligatorio]\n' >> notes.md
gh release edit vX.Y.Z -R mariocostabile/CusApp --notes-file notes.md && rm notes.md
```
Usalo solo se l'utente lo chiede.

## Regole da non violare

- **Versione**: la fonte è `app.json` → `expo.version`, scritta da release-please insieme a
  `.release-please-manifest.json`. Non toccarle a mano, non creare tag `v*` a mano.
- **versionCode** è calcolato in `app.config.js` (`major*10000 + minor*100 + patch`): non reintrodurlo in
  `app.json`. Minor e patch devono restare < 100.
- **Firma**: ogni APK va firmato con il keystore originale (Secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
  `KEY_ALIAS`, `KEY_PASSWORD`; in locale `CUSAPP_UPLOAD_*` in `~/.gradle/gradle.properties`, vedi
  `plugins/withReleaseSigning.js`). Una chiave diversa rende impossibile l'aggiornamento sopra l'app installata.
  Non stampare, committare o rigenerare il keystore.
- **URL degli APK**: `parseRelease` (`src/services/updateRelease.ts`) accetta solo download da
  `https://github.com/mariocostabile/CusApp/releases/download/`. Non allentare questo controllo.
- **Asset**: una sola `.apk` per release.
- **File di release-please**: `release-please-config.json`, `.release-please-manifest.json`, `version.txt`,
  `CHANGELOG.md` sono gestiti dal bot. Modificali solo per cambiare la configurazione, mai la versione.
- **Test**: `npm test` (Node, nessun jest) copre `app.config.js` e `src/services/updateRelease.ts`;
  tienili verdi prima di ogni merge.
- **Popup**: usa sempre `AppDialog`, come tutti i popup dell'app, per mantenere lo stesso stile.
- Non pubblicare release, non fare merge su `master` e non modificare i Secrets senza consenso esplicito.
- Solo `CusApp/`: non toccare `CusAppDemo/` se non richiesto.
