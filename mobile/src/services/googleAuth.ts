/**
 * Google sign-in (OAuth 2.0 / OpenID Connect).
 *
 * The flow: the app opens Google's consent screen in a browser, Google hands back an ID token,
 * and the backend verifies that token and returns the same payload the password login returns.
 *
 * Configure client IDs in app.json -> expo.extra.googleAuth (or EXPO_PUBLIC_GOOGLE_*_CLIENT_ID)
 * and GOOGLE_CLIENT_ID on the backend. When nothing is configured the button is hidden and the
 * app is email/password only, so this never blocks signing in the normal way.
 */
import { useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { authApi, describeApiError } from './api';
import { saveTokens, saveUser, saveOrg } from './storage';
import { notifySessionChange } from './session';
import { registerForPushNotificationsAsync, setupNotificationChannels } from './notifications';
import { GOOGLE_AUTH, googleSignInConfigured } from '../utils/config';

// Needed so the browser tab can hand control back to the app on Android/iOS.
WebBrowser.maybeCompleteAuthSession();

export function useGoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = googleSignInConfigured();

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_AUTH.webClientId || undefined,
    webClientId: GOOGLE_AUTH.webClientId || undefined,
    androidClientId: GOOGLE_AUTH.androidClientId || undefined,
    iosClientId: GOOGLE_AUTH.iosClientId || undefined,
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => {
    if (!configured) return;

    const finish = async (idToken: string) => {
      try {
        const res = await authApi.google(idToken);
        const { accessToken, refreshToken, user, org } = res.data;
        await saveTokens(accessToken, refreshToken);
        await saveUser(user);
        await saveOrg(org);
        notifySessionChange();
        setupNotificationChannels();
        registerForPushNotificationsAsync().catch(() => undefined);
      } catch (e: any) {
        setError(describeApiError(e));
      } finally {
        setBusy(false);
      }
    };

    if (response?.type === 'success') {
      const idToken: string | undefined =
        (response as any)?.params?.id_token || (response as any)?.authentication?.idToken;
      if (idToken) {
        finish(idToken);
      } else {
        setError('Google did not return an ID token. Check the client IDs in app.json.');
        setBusy(false);
      }
    } else if (response?.type === 'error') {
      setError(response.error?.message || 'Google sign-in was cancelled.');
      setBusy(false);
    }
  }, [response, configured]);

  const signIn = async () => {
    setError(null);
    if (!configured) {
      setError('Add a Google client ID in app.json (expo.extra.googleAuth) to enable this.');
      return;
    }
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result?.type === 'dismiss' || result?.type === 'cancel') {
        setBusy(false);
      } else if (result?.type === 'error') {
        setError(result.error?.message || 'Google sign-in failed.');
        setBusy(false);
      }
      // On success the effect above finishes the exchange.
    } catch (e: any) {
      setError(e?.message || 'Google sign-in failed.');
      setBusy(false);
    }
  };

  return { available: configured && !!request, signIn, busy, error };
}
