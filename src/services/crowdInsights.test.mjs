import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLiveTrend, getExtremeRange, getCrowdLevel, getSlotCrowdLevel } from './crowdInsights.ts';

test('getSlotCrowdLevel fa la media di typical sulle 2 ore del turno, ignorando percent', () => {
  const hours = [
    { hour: 15, typical: 10, percent: 99 },
    { hour: 16, typical: 45, percent: 99 },
    { hour: 17, typical: 82, percent: 99 },
    { hour: 18, typical: 10, percent: 99 },
  ];
  // (45 + 82) / 2 = 63.5 → 64: "Affollato", pillola rossa
  assert.deepEqual(getSlotCrowdLevel(hours, 16), getCrowdLevel(64));
  assert.equal(getSlotCrowdLevel(hours, 16).level, 'Affollato');
  assert.equal(getSlotCrowdLevel(hours, 16).tone, 'busy');
  // solo un'ora disponibile nel turno: usa quella
  assert.equal(getSlotCrowdLevel(hours, 18).level, 'Molto calmo');
});

test('getSlotCrowdLevel restituisce null senza dati (sabato)', () => {
  assert.equal(getSlotCrowdLevel([], 10), null);
  assert.equal(getSlotCrowdLevel([{ hour: 18, typical: 50 }], 10), null);
});

test('getCrowdLevel raggruppa i 5 livelli nei 3 colori delle pillole', () => {
  assert.equal(getCrowdLevel(10).tone, 'calm');
  assert.equal(getCrowdLevel(39).tone, 'calm');
  assert.equal(getCrowdLevel(40).tone, 'moderate');
  assert.equal(getCrowdLevel(59).tone, 'moderate');
  assert.equal(getCrowdLevel(60).tone, 'busy');
  assert.equal(getCrowdLevel(95).tone, 'busy');
});

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
