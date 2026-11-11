import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLiveTrend, getExtremeRange, getCrowdLevel } from './crowdInsights.ts';

test('getLiveTrend legge il testo di Google senza distinguere maiuscole', () => {
  assert.equal(getLiveTrend('Meno affollato del solito').kind, 'less');
  assert.equal(getLiveTrend('Molto meno affollato del solito').kind, 'less');
  assert.equal(getLiveTrend('In tempo reale: Più affollato del solito').kind, 'more');
  assert.equal(getLiveTrend('più affollata del solito').kind, 'more');
});

test('getLiveTrend ricade su "come al solito" per testi ignoti o assenti', () => {
  assert.equal(getLiveTrend('Consueto').kind, 'usual');
  assert.equal(getLiveTrend('').kind, 'usual');
  assert.equal(getLiveTrend(undefined).kind, 'usual');
});

test('getExtremeRange trova la prima fascia consecutiva del massimo', () => {
  const hours = [10, 11, 12, 13].map((hour, i) => ({
    hour,
    label: `${hour}:00`,
    percent: [20, 80, 80, 40][i],
    level: '',
  }));
  assert.deepEqual(getExtremeRange(hours, 'max'), { range: '11:00-13:00', percent: 80 });
  assert.deepEqual(getExtremeRange(hours, 'min'), { range: '10:00', percent: 20 });
  assert.equal(getExtremeRange([], 'max'), null);
});

test('getCrowdLevel usa una sola scala: stesso valore, stesso colore', () => {
  assert.equal(getCrowdLevel(10).level, 'Molto calmo');
  assert.equal(getCrowdLevel(20).level, 'Calmo');
  assert.equal(getCrowdLevel(55).level, 'Moderato');
  assert.equal(getCrowdLevel(79).level, 'Affollato');
  assert.equal(getCrowdLevel(80).level, 'Molto affollato');
  assert.equal(getCrowdLevel(90).color, '#EF4444');
  assert.equal(getCrowdLevel(55).color, getCrowdLevel(55).color);
});
