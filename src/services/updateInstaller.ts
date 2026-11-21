import { Directory, File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { AppState } from 'react-native';
import { downloadFraction, isCompleteApk, staleApkNames, type AvailableUpdate } from './updateRelease';

const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const FLAG_GRANT_READ_URI_PERMISSION = 1; // android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION

const apkFile = (version: string) => new File(Paths.cache, `CusCosenza-${version}.apk`);

/** True se l'APK di questa versione è già scaricato per intero (il .part viene rinominato solo a fine download). */
export function isApkDownloaded(version: string): boolean {
  return apkFile(version).exists;
}

// Una volta per processo: se Android ricrea l'activity durante un download, il .part in scrittura resta.
let cleaned = false;

/** Cancella dalla cache i download interrotti e gli APK di versioni già installate. Non lancia mai errori. */
export function cleanupApks(currentVersion: string): void {
  if (cleaned) return;
  cleaned = true;
  try {
    const names = new Directory(Paths.cache)
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => file.name);
    for (const name of staleApkNames(names, currentVersion)) {
      try {
        new File(Paths.cache, name).delete();
      } catch {
        // Un file non cancellabile non deve impedire di pulire gli altri.
      }
    }
  } catch {
    // La pulizia è solo un risparmio di spazio: mai bloccare l'app.
  }
}

// Da Android 10 un'app in background non può aprire l'installer: aspettiamo che l'utente rientri.
// shortcut: AppState arriva in JS con qualche ms di ritardo, uscire proprio in quell'istante lascia il popup fermo al 100%
// fino al riavvio; da rivedere se qualcuno lo segnala.
function waitForForeground(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      sub.remove();
      resolve();
    });
  });
}

/**
 * Scarica l'APK nella cache (o riusa quello già scaricato) e apre l'installer di Android.
 * onProgress riceve una frazione 0..1, oppure null se la dimensione non è nota.
 * Al primo utilizzo Android chiede all'utente di consentire a CusApp di installare app sconosciute.
 */
export async function downloadAndInstall(
  update: AvailableUpdate,
  onProgress: (fraction: number | null) => void,
): Promise<void> {
  const apk = apkFile(update.version);
  // Un APK troncato (es. lasciato da una versione vecchia che scriveva direttamente il file finale) si riscarica.
  if (apk.exists && !isCompleteApk(apk.size, update.apkSize)) apk.delete();
  if (!apk.exists) {
    const partial = new File(Paths.cache, `${apk.name}.part`);
    await File.downloadFileAsync(update.apkUrl, partial, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) =>
        onProgress(downloadFraction(bytesWritten, totalBytes, update.apkSize)),
    });
    partial.rename(apk.name);
  }

  await waitForForeground();
  await startActivityAsync('android.intent.action.VIEW', {
    data: apk.contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}
