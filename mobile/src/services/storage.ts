import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = 'orderconfirm_access_token';
const REFRESH_TOKEN_KEY = 'orderconfirm_refresh_token';
const USER_KEY = 'orderconfirm_user';
const ORG_KEY = 'orderconfirm_org';

export async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await AsyncStorage.removeItem(USER_KEY);
  await AsyncStorage.removeItem(ORG_KEY);
}

export async function saveUser(user: any) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getUser(): Promise<any | null> {
  const v = await AsyncStorage.getItem(USER_KEY);
  return v ? JSON.parse(v) : null;
}

export async function saveOrg(org: any) {
  await AsyncStorage.setItem(ORG_KEY, JSON.stringify(org));
}

export async function getOrg(): Promise<any | null> {
  const v = await AsyncStorage.getItem(ORG_KEY);
  return v ? JSON.parse(v) : null;
}

// Cache for offline
export async function cacheDashboard(data: any) {
  await AsyncStorage.setItem('cache_dashboard', JSON.stringify({ data, ts: Date.now() }));
}
export async function getCachedDashboard(): Promise<any | null> {
  const v = await AsyncStorage.getItem('cache_dashboard');
  return v ? JSON.parse(v) : null;
}
export async function cacheOrders(data: any) {
  await AsyncStorage.setItem('cache_orders', JSON.stringify({ data, ts: Date.now() }));
}
export async function getCachedOrders(): Promise<any | null> {
  const v = await AsyncStorage.getItem('cache_orders');
  return v ? JSON.parse(v) : null;
}
