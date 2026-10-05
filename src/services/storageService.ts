import AsyncStorage from '@react-native-async-storage/async-storage';
import { DashboardData } from './ginnipalService';

const KEY_USER_EMAIL = '@cusapp_user_email';
const KEY_USER_PASSWORD = '@cusapp_user_password';
const KEY_DASHBOARD_DATA = '@cusapp_dashboard_data';

export async function saveUserSession(
  email: string,
  pass: string,
  data?: DashboardData
): Promise<void> {
  try {
    const pairs: [string, string][] = [
      [KEY_USER_EMAIL, email],
      [KEY_USER_PASSWORD, pass],
    ];
    if (data && data.name) {
      pairs.push([KEY_DASHBOARD_DATA, JSON.stringify(data)]);
    }
    await AsyncStorage.multiSet(pairs);
  } catch (e) {
    console.warn('[StorageService] Error saving user session:', e);
  }
}

export async function saveCachedDashboard(data: DashboardData): Promise<void> {
  try {
    if (data && data.name) {
      await AsyncStorage.setItem(KEY_DASHBOARD_DATA, JSON.stringify(data));
    }
  } catch (e) {
    console.warn('[StorageService] Error caching dashboard data:', e);
  }
}

export async function getUserSession(): Promise<{
  email: string;
  password: string;
  dashboardData: DashboardData | null;
} | null> {
  try {
    const values = await AsyncStorage.multiGet([
      KEY_USER_EMAIL,
      KEY_USER_PASSWORD,
      KEY_DASHBOARD_DATA,
    ]);
    const email = values[0][1];
    const password = values[1][1];
    const rawData = values[2][1];

    if (!email || !password) {
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
    console.warn('[StorageService] Error getting user session:', e);
    return null;
  }
}

export async function clearUserSession(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      KEY_USER_EMAIL,
      KEY_USER_PASSWORD,
      KEY_DASHBOARD_DATA,
    ]);
  } catch (e) {
    console.warn('[StorageService] Error clearing user session:', e);
  }
}
