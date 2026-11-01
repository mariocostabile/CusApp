import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const makeConfig = require('./app.config.js');
const { versionCodeFrom } = makeConfig;

test('versionCode = major*10000 + minor*100 + patch', () => {
  assert.equal(versionCodeFrom('2.6.5'), 20605);
  assert.equal(versionCodeFrom('2.7.0'), 20700);
  assert.equal(versionCodeFrom('3.0.0'), 30000);
});

test('versionCode cresce sempre con la versione', () => {
  assert.ok(versionCodeFrom('2.6.10') > versionCodeFrom('2.6.9'));
  assert.ok(versionCodeFrom('2.7.0') > versionCodeFrom('2.6.99'));
  assert.ok(versionCodeFrom('2.6.5') > 2); // versionCode attualmente installato
});

test('rifiuta versioni non rappresentabili', () => {
  for (const v of ['', '2.6', '2.6.5-beta', '2.100.0', '2.6.100', 'v2.6.5']) {
    assert.throws(() => versionCodeFrom(v), /versione non valida/, v);
  }
});

test('la config mantiene i campi android esistenti', () => {
  const out = makeConfig({ config: { version: '2.6.5', android: { package: 'it.cuscosenza.app' } } });
  assert.equal(out.android.versionCode, 20605);
  assert.equal(out.android.package, 'it.cuscosenza.app');
  assert.equal(out.version, '2.6.5');
});
