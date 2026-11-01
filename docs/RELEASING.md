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

## Pubblicare un aggiornamento

Il versionamento è gestito da **release-please**: non modificare mai a mano la versione.

1. Lavora su un branch, commit in **Conventional Commits**:
   - `fix: ...` → patch (2.6.5 → 2.6.6)
   - `feat: ...` → minor (2.6.5 → 2.7.0)
   - `feat!: ...` o footer `BREAKING CHANGE:` → major
   - `chore:`, `docs:`, `refactor:`, `style:`, `test:`, `ci:` → nessun rilascio
   I messaggi `fix`/`feat` finiscono nelle note del popup: scrivili in italiano, chiari per l'utente finale.
2. Merge su `master` (solo con il consenso dell'utente). release-please apre o aggiorna la
   Release PR `chore(master): release X.Y.Z`.
3. Rilascio = merge della Release PR (solo su richiesta esplicita dell'utente). Il workflow crea il tag
   `vX.Y.Z`, la GitHub Release e allega `CusCosenza-vX.Y.Z.apk` firmato.
4. Verifica: `gh release view vX.Y.Z -R mariocostabile/CusApp` deve elencare un asset `.apk`.
   Se manca, controlla il job `build-apk` con `gh run list -R mariocostabile/CusApp --workflow release.yml`.

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
- **URL degli APK**: `updateService` accetta solo download da
  `https://github.com/mariocostabile/CusApp/releases/download/`. Non allentare questo controllo.
- **Asset**: una sola `.apk` per release.
- Non pubblicare release, non fare merge su `master` e non modificare i Secrets senza consenso esplicito.
- Solo `CusApp/`: non toccare `CusAppDemo/` se non richiesto.
