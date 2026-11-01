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
