const { withAppBuildGradle } = require('@expo/config-plugins');

// Signing values live in ~/.gradle/gradle.properties (never in the repo).
// Without them AGP fails the release build instead of silently signing with the public debug key.
const RELEASE_SIGNING_CONFIG = `
        release {
            if (project.hasProperty('CUSAPP_UPLOAD_STORE_FILE')) {
                storeFile file(CUSAPP_UPLOAD_STORE_FILE)
                storePassword CUSAPP_UPLOAD_STORE_PASSWORD
                keyAlias CUSAPP_UPLOAD_KEY_ALIAS
                keyPassword CUSAPP_UPLOAD_KEY_PASSWORD
            }
        }`;

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (modConfig) => {
    let gradle = modConfig.modResults.contents;
    if (gradle.includes('CUSAPP_UPLOAD_STORE_FILE')) return modConfig;

    gradle = gradle.replace(/signingConfigs \{/, `signingConfigs {${RELEASE_SIGNING_CONFIG}`);
    const swapped = gradle.replace(
      /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release'
    );
    if (swapped === gradle) {
      throw new Error('[withReleaseSigning] release signingConfig not found in app/build.gradle');
    }
    modConfig.modResults.contents = swapped;
    return modConfig;
  });

module.exports = withReleaseSigning;
