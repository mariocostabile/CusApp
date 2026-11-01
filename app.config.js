// La versione è scritta da release-please in app.json (expo.version).
// versionCode ne deriva: major*10000 + minor*100 + patch, sempre crescente finché minor e patch restano < 100.
function versionCodeFrom(version) {
  const parts = String(version).split('.');
  const numbers = parts.map(Number);
  const valid =
    parts.length === 3 &&
    numbers.every((n) => Number.isInteger(n) && n >= 0) &&
    numbers[1] < 100 &&
    numbers[2] < 100;
  if (!valid) {
    throw new Error(`[app.config] versione non valida per versionCode: "${version}"`);
  }
  return numbers[0] * 10000 + numbers[1] * 100 + numbers[2];
}

module.exports = ({ config }) => ({
  ...config,
  android: { ...config.android, versionCode: versionCodeFrom(config.version) },
});
module.exports.versionCodeFrom = versionCodeFrom;
