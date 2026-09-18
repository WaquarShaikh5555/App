import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import {
  Banner,
  BrandHeader,
  Card,
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
import { getApiUrl } from '../services/serverConfig';
import { colors } from '../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export default function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const google = useGoogleSignIn();

  const validate = () => {
    const next: Record<string, string | null> = {};
    if (!email.trim()) next.email = 'Enter your email';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'That does not look like an email address';
    // The backend requires at least 8 characters; failing here saves a round trip.
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters`;
    if (confirm !== password) next.confirm = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleRegister = async () => {
    setError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await authApi.register(
        email.trim().toLowerCase(),
        password,
        name.trim() || undefined,
        orgName.trim() || undefined
      );
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
      setLoading(false);
    }
  };

  return (
    <Screen>
      <BrandHeader title="Create your store account" subtitle="Takes a minute. No card needed." />

      {error ? (
        <Banner
          tone="error"
          title="Could not create the account"
          message={error}
          action={{ label: 'Check server settings', onPress: () => navigation.navigate('ServerSettings') }}
        />
      ) : null}

      <Card>
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          placeholder="Asha Verma"
          autoCapitalize="words"
        />
        <Field
          label="Store name"
          value={orgName}
          onChangeText={setOrgName}
          placeholder="Asha's Boutique"
          autoCapitalize="words"
          hint="Shown in the app header and on customer messages."
        />
        <Field
          label="Email"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (errors.email) setErrors((prev) => ({ ...prev, email: null }));
          }}
          placeholder="you@store.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          error={errors.email}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (errors.password) setErrors((prev) => ({ ...prev, password: null }));
          }}
          placeholder={`At least ${MIN_PASSWORD} characters`}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          error={errors.password}
          hint={errors.password ? undefined : `Minimum ${MIN_PASSWORD} characters.`}
          right={
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
              <Text style={{ color: colors.brandDark, fontWeight: '600', fontSize: 12 }}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          }
        />
        <Field
          label="Confirm password"
          value={confirm}
          onChangeText={(text) => {
            setConfirm(text);
            if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: null }));
          }}
          placeholder="Repeat the password"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          onSubmitEditing={handleRegister}
          error={errors.confirm}
        />

        <PrimaryButton title="Create account" onPress={handleRegister} loading={loading} />

        {google.available ? (
          <>
            <Text style={{ textAlign: 'center', color: colors.textFaint, fontSize: 12, marginVertical: 12 }}>
              or
            </Text>
            <PrimaryButton
              title="Sign up with Google"
              variant="ghost"
              onPress={google.signIn}
              loading={google.busy}
              disabled={loading}
            />
          </>
        ) : null}
      </Card>

      <LinkText onPress={() => navigation.navigate('Login')}>Already have an account? Sign in</LinkText>

      <ServerFooter url={getApiUrl()} onPress={() => navigation.navigate('ServerSettings')} />
    </Screen>
  );
}
