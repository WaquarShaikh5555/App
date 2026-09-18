import Constants from 'expo-constants';

/**
 * Build-time default for the backend address.
 *
 * This is only the starting point: the address can be changed inside the app
 * (Settings -> Server) without rebuilding, see services/serverConfig.ts.
 */
export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || 'http://10.0.2.2:3000';

/** Kept for callers that still import it; prefer getApiUrl() from services/serverConfig. */
export const API_URL = DEFAULT_API_URL;

export const APP_SCHEME = 'orderconfirm';

/**
 * Google sign-in client IDs (optional).
 *
 * Android needs an "Android" OAuth client whose SHA-1 matches the signing key; iOS needs an
 * iOS client; the web client covers everything else. When none of these is set the Google
 * button is simply not shown, so the app works as email/password only.
 */
const extra = (Constants.expoConfig?.extra || {}) as any;

export const GOOGLE_AUTH = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra.googleAuth?.webClientId || '',
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || extra.googleAuth?.androidClientId || '',
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || extra.googleAuth?.iosClientId || '',
};

export function googleSignInConfigured(): boolean {
  return Boolean(GOOGLE_AUTH.webClientId || GOOGLE_AUTH.androidClientId || GOOGLE_AUTH.iosClientId);
}
