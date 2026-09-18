import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Banner,
  BrandHeader,
  Card,
  Divider,
  Field,
  LinkText,
  PrimaryButton,
  Screen,
  ServerFooter,
} from '../components/ui';
import { authApi, describeApiError } from '../services/api';
import { saveTokens, saveUser, saveOrg } from '../services/storage';
import { notifySessionChange } from '../services/session';
import { registerForPushNotificationsAsync, setupNotificationChannels } from '../services/notifications';
import { useGoogleSignIn } from '../services/googleAuth';
import { getApiUrl, hasSavedApiUrl, loadApiUrl, setApiUrl } from '../services/serverConfig';
import { discoverBackend } from '../services/discovery';
import { colors } from '../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A fresh install has no backend address, and the build-time default only fits an
 * emulator. Rather than showing a dead login form, look for the backend on Wi-Fi once.
 * The module-level flag keeps it to a single attempt per app launch, across remounts.
 */
let autoScanAttempted = false;

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiUrl());
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [foundServer, setFoundServer] = useState<string | null>(null);

  const google = useGoogleSignIn();

  const refreshServerUrl = useCallback(async () => {
    const url = await loadApiUrl();
    setServerUrl(url);
  }, []);

  const findServerOnWifi = useCallback(async () => {
    if (autoScanAttempted) return;
    autoScanAttempted = true;
    if (await hasSavedApiUrl()) return;

    setScanNote('Looking for your OrderConfirm server on this Wi-Fi...');
    const outcome = await discoverBackend();
    setScanNote(null);
    if (outcome.ok) {
      await setApiUrl(outcome.server.url);
      setServerUrl(getApiUrl());
      setFoundServer(getApiUrl());
    }
  }, []);

  useEffect(() => {
    refreshServerUrl();
    findServerOnWifi();
    const unsubscribe = navigation.addListener('focus', refreshServerUrl);
    return unsubscribe;
  }, [navigation, refreshServerUrl, findServerOnWifi]);

  const validate = () => {
    let ok = true;
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setEmailError('Enter your email');
      ok = false;
    } else if (!EMAIL_RE.test(cleanEmail)) {
      setEmailError('That does not look like an email address');
      ok = false;
    } else {
      setEmailError(null);
    }
    if (!password) {
      setPasswordError('Enter your password');
      ok = false;
    } else {
      setPasswordError(null);
    }
    return ok;
  };

  const handleLogin = async () => {
    setError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await authApi.login(email.trim().toLowerCase(), password);
      const { accessToken, refreshToken, user, org } = res.data;
      await saveTokens(accessToken, refreshToken);
      await saveUser(user);
      await saveOrg(org);
      // Tells AppNavigator to swap the auth screens for the app itself. No manual
      // navigation needed (and none was possible: MainTabs was not registered yet).
      notifySessionChange();

      // Push setup is best-effort: a failure here must never look like a login failure.
      setupNotificationChannels();
      registerForPushNotificationsAsync().catch(() => undefined);
    } catch (e: any) {
      setError(describeApiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <BrandHeader title="OrderConfirm" subtitle="Confirm COD orders before you ship them" />

      {error ? (
        <Banner
          tone="error"
          title="Could not sign in"
          message={error}
          action={{ label: 'Check server settings', onPress: () => navigation.navigate('ServerSettings') }}
        />
      ) : null}

      {google.error ? <Banner tone="error" title="Google sign-in failed" message={google.error} /> : null}

      {foundServer ? (
        <Banner
          tone="success"
          title="Found your server"
          message={`Sign in below, or create an account if you have not set one up yet. Using ${foundServer}.`}
        />
      ) : null}

      {scanNote ? <Banner tone="info" message={scanNote} /> : null}

      <Card>
        <Field
          label="Email"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (emailError) setEmailError(null);
          }}
          placeholder="you@store.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          error={emailError}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (passwordError) setPasswordError(null);
          }}
          placeholder="Your password"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
          error={passwordError}
          right={
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
              <Text style={{ color: colors.brandDark, fontWeight: '600', fontSize: 12 }}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          }
        />

        <PrimaryButton title="Sign in" onPress={handleLogin} loading={loading} />

        {google.available ? (
          <>
            <Divider label="or" />
            <PrimaryButton
              title="Continue with Google"
              variant="ghost"
              onPress={google.signIn}
              loading={google.busy}
              disabled={loading}
            />
          </>
        ) : null}
      </Card>

      <View style={{ alignItems: 'center', gap: 12 }}>
        <LinkText onPress={() => navigation.navigate('Register')}>New here? Create an account</LinkText>
        <LinkText onPress={() => navigation.navigate('Onboarding')}>How OrderConfirm works</LinkText>
      </View>

      <ServerFooter url={serverUrl} onPress={() => navigation.navigate('ServerSettings')} />
    </Screen>
  );
}
