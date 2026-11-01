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
