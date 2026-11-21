# APK dell'aggiornamento: riuso, attesa del rientro e pulizia — design

## Perché
Oggi l'APK scaricato resta per sempre nella cache (uno per versione, ~35 MB l'uno), non viene riusato
se l'utente annulla l'installer (ripremendo si riscarica tutto) e, se a fine download l'app è in
background, Android impedisce di aprire l'installer e il popup rischia di segnalare un errore.

## Obiettivi
- Download completato e installer annullato: ripremendo il pulsante si apre subito l'installer, senza riscaricare.
- Download finito mentre l'utente è in un'altra app: l'installer si apre appena l'utente rientra nell'app.
- Nessun APK inutile in cache: cancellati quelli di versioni già installate e i download interrotti.

## Non obiettivi
- Download che sopravvive alla chiusura completa dell'app (si perde: si riparte da zero).
- Ripresa di un download interrotto da dove era arrivato.
- Notifica di sistema del download.

## Approcci
- **Scelto — file temporaneo + pulizia all'avvio**: download in `CusCosenza-X.Y.Z.apk.part`, rinomina in
  `CusCosenza-X.Y.Z.apk` a fine download: se il `.apk` esiste è completo.
- Scartato — completezza verificata con la dimensione GitHub: senza `size` il file non sarebbe mai riusabile.
- Scartato — `DownloadTask` con pausa/ripresa: complessità per un caso (app chiusa) escluso.

## Design
- Funzione pura in `updateRelease.ts`: `staleApkNames(names: string[], currentVersion: string): string[]`.
  Restituisce i nomi da cancellare tra quelli nella forma `CusCosenza-X.Y.Z.apk` o `CusCosenza-X.Y.Z.apk.part`:
  tutti i `.part`, e gli `.apk` con versione uguale o più vecchia di `currentVersion`. Gli altri file non si toccano.
- `updateInstaller.ts`:
  - `isApkDownloaded(version: string): boolean` — esiste `CusCosenza-<version>.apk`.
  - `downloadAndInstall(update, onProgress)` (firma invariata): se l'APK completo c'è lo usa, altrimenti scarica nel
    `.part` e lo rinomina; prima di aprire l'installer, se l'app non è in primo piano aspetta il ritorno in primo piano.
  - `cleanupApks(currentVersion: string): void` — cancella dalla cache i file indicati da `staleApkNames`; ogni
    errore è ignorato (la pulizia non deve mai bloccare l'app).
- `update-prompt.tsx`:
  - `cleanupApks` una sola volta al montaggio (avvio a freddo), **non** a ogni ritorno in primo piano: un download
    in corso mentre l'app era in background ha un `.part` che non va cancellato.
  - In stato `ready`, se `isApkDownloaded(update.version)`: pulsante "Installa" e messaggio che l'aggiornamento è già
    scaricato; altrimenti testo e pulsante attuali ("Aggiorna ora").

## Limiti noti
- Il comportamento nuovo vale dal download fatto da una versione che contiene questa modifica. L'APK della 2.8.4,
  scaricato dalla 2.8.3, viene comunque cancellato al primo avvio della 2.8.4 (versione uguale a quella installata).
- Android può svuotare la cache da solo: in quel caso si riscarica, come oggi.
