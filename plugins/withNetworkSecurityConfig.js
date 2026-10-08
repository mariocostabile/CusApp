const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- In release builds, disallow unencrypted cleartext HTTP traffic -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <debug-overrides>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
`;

/**
 * Expo Config Plugin to enforce Android Network Security Config:
 * - Disallows cleartext HTTP in release mode
 * - Allows trusted certificates
 */
const withNetworkSecurityConfig = (config) => {
  // 1. Add android:networkSecurityConfig to AndroidManifest.xml
  config = withAndroidManifest(config, (modConfig) => {
    const mainApplication = modConfig.modResults.manifest.application[0];
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return modConfig;
  });

  // 2. Ensure res/xml/network_security_config.xml is written during prebuild
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const xmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(xmlDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG_XML,
        'utf8'
      );
      return modConfig;
    },
  ]);

  return config;
};

module.exports = withNetworkSecurityConfig;
