import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Banner, Card, Field, PrimaryButton, Screen, SectionTitle } from '../components/ui';
import {
  ConnectionResult,
  getApiUrl,
  hostLabel,
  resetApiUrl,
  sanitizeUrl,
  setApiUrl,
  testConnection,
} from '../services/serverConfig';
import { discoverBackend } from '../services/discovery';
import { DEFAULT_API_URL } from '../utils/config';
import { colors } from '../theme';

export default function ServerSettingsScreen({ navigation }: any) {
  const [url, setUrl] = useState(getApiUrl());
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  useEffect(() => {
    setUrl(getApiUrl());
  }, []);

  const runTest = async (candidate?: string) => {
    setTesting(true);
    setSaved(false);
    const outcome = await testConnection(candidate ?? url);
    setResult(outcome);
    setTesting(false);
    return outcome;
  };

  const handleSave = async () => {
    await setApiUrl(url);
    setUrl(getApiUrl());
    setSaved(true);
    setResult(null);
    // Let the previous screen show the new address; the next request uses it immediately.
    setTimeout(() => navigation.goBack(), 600);
  };

  const handleReset = async () => {
    const next = await resetApiUrl();
    setUrl(next);
    setResult(null);
    setSaved(false);
  };

  /** Look for the backend on the phone's Wi-Fi and adopt it if it answers. */
  const handleScan = async () => {
    setScanning(true);
    setResult(null);
    setSaved(false);
    setScanNote('Scanning your Wi-Fi...');
    const outcome = await discoverBackend((message) => setScanNote(message));
    if (outcome.ok) {
      setUrl(outcome.server.url);
      setScanNote(null);
      await setApiUrl(outcome.server.url);
      setSaved(true);
      setResult({
        ok: true,
        message: `Connected to ${hostLabel(outcome.server.url)}`,
        details: { version: outcome.server.version, mockMode: outcome.server.mockMode },
      });
    } else {
      setScanNote(outcome.message);
    }
    setScanning(false);
  };

  // Save only when the address actually answers, unless the user insists.
  const handleSaveUntested = async () => {
    const outcome = await runTest();
    if (outcome.ok) {
      await handleSave();
    }
  };

  return (
    <Screen>
      <SectionTitle>Server</SectionTitle>

      <Card>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
          The app talks to your OrderConfirm backend. Point it at wherever that backend runs -
          your computer on the same Wi-Fi, a tunnel, or a deployed server. Not sure of the
          address? Tap "Find it on my Wi-Fi" and the app will look for it.
        </Text>

        <Field
          label="Backend address"
          value={url}
          onChangeText={(text) => {
            setUrl(text);
            setResult(null);
            setSaved(false);
          }}
          placeholder="http://192.168.1.5:3000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint={`Build default: ${DEFAULT_API_URL}`}
        />

        {result ? (
          <Banner
            tone={result.ok ? 'success' : 'error'}
            title={result.ok ? 'Connection works' : 'No connection'}
            message={
              result.ok
                ? `${result.message}${result.details?.version ? ` - backend v${result.details.version}` : ''}${
                    result.details?.mockMode ? ' (mock mode: data is in memory, no database needed)' : ''
                  }`
                : result.message
            }
          />
        ) : null}

        {saved ? <Banner tone="success" message="Saved. The app will use this address from now on." /> : null}

        {scanNote && !result ? <Banner tone="info" message={scanNote} /> : null}

        <View style={{ gap: 10 }}>
          <PrimaryButton title="Find it on my Wi-Fi" variant="ghost" onPress={handleScan} loading={scanning} />
          <PrimaryButton title="Test connection" variant="ghost" onPress={() => runTest()} loading={testing} />
          <PrimaryButton title="Save and use this address" onPress={handleSaveUntested} />
          <PrimaryButton title="Reset to default" variant="ghost" onPress={handleReset} />
        </View>
      </Card>

      <Card>
        <SectionTitle>Where do I find the address?</SectionTitle>
        {[
          {
            title: 'Same Wi-Fi as your computer',
            body: 'Run the backend on your computer, then use its local IP, e.g. http://192.168.1.5:3000. Find it with `ipconfig` (Windows) or `ifconfig | grep inet` (Mac/Linux).',
          },
          {
            title: 'Tunnel (works from anywhere)',
            body: 'Run `ngrok http 3000` and use the https URL it prints, e.g. https://abc123.ngrok-free.app.',
          },
          {
            title: 'Deployed backend',
            body: 'Use the public URL, e.g. https://api.yourdomain.com.',
          },
        ].map((item) => (
          <View key={item.title} style={{ marginBottom: 14 }}>
            <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 3 }}>{item.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>{item.body}</Text>
          </View>
        ))}
        <Banner
          tone="info"
          message={
            'Note: plain http:// addresses only work in this build because cleartext traffic is enabled for local ' +
            'development. Use https:// for anything public.'
          }
        />
      </Card>
    </Screen>
  );
}
