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
