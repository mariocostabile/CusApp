import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { DashboardData } from './ginnipalService';

const KEY_USER_EMAIL = '@cusapp_user_email';
const KEY_LEGACY_USER_PASSWORD = '@cusapp_user_password';
const KEY_DASHBOARD_DATA = '@cusapp_dashboard_data';

const SECURE_KEY_PASSWORD = 'cusapp_user_password';

/**
 * Checks whether SecureStore is available on current platform.
 */
async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Saves user session securely.
 * The password is stored encrypted in hardware Keystore (SecureStore) on Android/iOS.
 */
export async function saveUserSession(
  email: string,
  pass: string,
  data?: DashboardData
): Promise<void> {
  try {
    const pairs: [string, string][] = [
      [KEY_USER_EMAIL, email],
    ];
    if (data && data.name) {
      pairs.push([KEY_DASHBOARD_DATA, JSON.stringify(data)]);
    }

    const secureAvailable = await isSecureStoreAvailable();
    if (secureAvailable) {
      // Store password encrypted in SecureStore (hardware Keystore)
      await SecureStore.setItemAsync(SECURE_KEY_PASSWORD, pass, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      // Purge any legacy unencrypted password from AsyncStorage
      await AsyncStorage.removeItem(KEY_LEGACY_USER_PASSWORD);
    } else {
      // Fallback for non-supported platforms (e.g. web)
      pairs.push([KEY_LEGACY_USER_PASSWORD, pass]);
    }

    await AsyncStorage.multiSet(pairs);
  } catch (e) {
    if (__DEV__) {
      console.warn('[StorageService] Error saving user session:', e);
    }
  }
}

export async function saveCachedDashboard(data: DashboardData): Promise<void> {
  try {
    if (data && data.name) {
      await AsyncStorage.setItem(KEY_DASHBOARD_DATA, JSON.stringify(data));
    }
  } catch (e) {
    if (__DEV__) {
      console.warn('[StorageService] Error caching dashboard data:', e);
    }
  }
}

/**
 * Retrieves the user session.
 * Seamlessly migrates legacy unencrypted AsyncStorage passwords to SecureStore.
 */
export async function getUserSession(): Promise<{
  email: string;
  password: string;
  dashboardData: DashboardData | null;
} | null> {
  try {
    const values = await AsyncStorage.multiGet([
      KEY_USER_EMAIL,
      KEY_LEGACY_USER_PASSWORD,
      KEY_DASHBOARD_DATA,
    ]);
    const email = values[0][1];
    const legacyPassword = values[1][1];
    const rawData = values[2][1];

    if (!email) {
      return null;
    }

    let password = '';
    const secureAvailable = await isSecureStoreAvailable();

    if (secureAvailable) {
      // 1. Try to read from SecureStore
      const securePass = await SecureStore.getItemAsync(SECURE_KEY_PASSWORD);
      if (securePass) {
        password = securePass;
        // If legacy key still lingers in AsyncStorage, remove it
        if (legacyPassword) {
          await AsyncStorage.removeItem(KEY_LEGACY_USER_PASSWORD);
        }
      } else if (legacyPassword) {
        // 2. Seamless migration: user upgraded app from old version
        password = legacyPassword;
        await SecureStore.setItemAsync(SECURE_KEY_PASSWORD, legacyPassword, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        await AsyncStorage.removeItem(KEY_LEGACY_USER_PASSWORD);
        if (__DEV__) {
          console.log('[StorageService] Migrated user password to SecureStore');
        }
      }
    } else if (legacyPassword) {
      password = legacyPassword;
    }

    if (!password) {
      return null;
    }

    let dashboardData: DashboardData | null = null;
    if (rawData) {
      try {
        dashboardData = JSON.parse(rawData);
      } catch {}
    }

    return { email, password, dashboardData };
  } catch (e) {
    if (__DEV__) {
      console.warn('[StorageService] Error getting user session:', e);
    }
    return null;
  }
}

export async function clearUserSession(): Promise<void> {
  try {
    const secureAvailable = await isSecureStoreAvailable();
    if (secureAvailable) {
      await SecureStore.deleteItemAsync(SECURE_KEY_PASSWORD);
    }

    await AsyncStorage.multiRemove([
      KEY_USER_EMAIL,
      KEY_LEGACY_USER_PASSWORD,
      KEY_DASHBOARD_DATA,
    ]);
  } catch (e) {
    if (__DEV__) {
      console.warn('[StorageService] Error clearing user session:', e);
    }
  }
}
