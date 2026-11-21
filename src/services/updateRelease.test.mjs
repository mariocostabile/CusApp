import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, isNewer, cleanNotes, parseRelease, downloadFraction, staleApkNames, isCompleteApk } from './updateRelease.ts';

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
    assets: [{ name: 'CusCosenza-v2.7.0.apk', browser_download_url: APK_URL, size: 52_428_800 }],
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
    apkSize: 52_428_800,
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

test('parseRelease mette apkSize a null se size non è un intero positivo', () => {
  for (const size of [undefined, 0, -1, 1.5, '100']) {
    const assets = [{ name: 'CusCosenza-v2.7.0.apk', browser_download_url: APK_URL, size }];
    assert.equal(parseRelease(release({ assets }), '2.6.5').apkSize, null);
  }
});

test('downloadFraction usa il totale del server, poi apkSize, altrimenti null', () => {
  assert.equal(downloadFraction(50, 200, 100), 0.25);
  assert.equal(downloadFraction(50, 0, 100), 0.5);
  assert.equal(downloadFraction(50, -1, 100), 0.5);
  assert.equal(downloadFraction(50, 0, null), null);
  assert.equal(downloadFraction(150, 0, 100), 1);
});

test('staleApkNames cancella .part e APK di versioni già installate, nient altro', () => {
  const names = ['CusCosenza-2.8.3.apk', 'CusCosenza-2.8.4.apk', 'CusCosenza-2.8.5.apk',
    'CusCosenza-2.8.5.apk.part', 'altro.txt', 'CusCosenza-latest.apk'];
  assert.deepEqual(staleApkNames(names, '2.8.4'),
    ['CusCosenza-2.8.3.apk', 'CusCosenza-2.8.4.apk', 'CusCosenza-2.8.5.apk.part']);
});

test('staleApkNames con versione installata non valida cancella solo i .part', () => {
  assert.deepEqual(staleApkNames(['CusCosenza-2.8.3.apk', 'CusCosenza-2.8.3.apk.part'], 'boh'),
    ['CusCosenza-2.8.3.apk.part']);
});

test('isCompleteApk confronta la dimensione solo se GitHub la conosce', () => {
  assert.equal(isCompleteApk(100, 100), true);
  assert.equal(isCompleteApk(40, 100), false);
  assert.equal(isCompleteApk(40, null), true);
});
