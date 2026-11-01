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
