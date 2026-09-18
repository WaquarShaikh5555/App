import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TextInput, Button, Alert, ActivityIndicator } from 'react-native';
import { settingsApi, shopifyApi, whatsappApi, describeApiError } from '../services/api';
import { clearTokens } from '../services/storage';
import { notifySessionChange } from '../services/session';
import { getApiUrl } from '../services/serverConfig';

export default function SettingsScreen({ navigation }: any) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [shopStatus, setShopStatus] = useState<any>(null);
  const [waStatus, setWaStatus] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const sRes = await settingsApi.get();
      setSettings(sRes.data);
      try {
        const shopRes = await shopifyApi.status();
        setShopStatus(shopRes.data);
      } catch {}
      try {
        const waRes = await whatsappApi.status();
        setWaStatus(waRes.data);
      } catch {}
    } catch (e: any) {
      Alert.alert('Could not load settings', describeApiError(e), [
        { text: 'Server settings', onPress: () => navigation.navigate('ServerSettings') },
        { text: 'OK', style: 'cancel' },
      ]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateRules = async (newRules: any) => {
    try {
      const res = await settingsApi.update({ rules: { ...settings.rules, ...newRules } });
      setSettings(res.data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleLogout = async () => {
    await clearTokens();
    // The navigator listens for this and swaps back to the login screen by itself.
    notifySessionChange();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading settings...</Text></View>;

  const rules = settings?.rules || {};

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connections</Text>
        <Text>Shopify: {shopStatus?.connected ? `Connected (${shopStatus.connection?.shopDomain})` : 'Disconnected'}</Text>
        <Text>WhatsApp: {waStatus?.connected ? `Connected (${waStatus.displayPhoneNumber}) template ${waStatus.templateStatus}` : 'Disconnected'}</Text>
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <View style={{ flex: 1, marginRight: 5 }}><Button title="Shopify" onPress={() => navigation.navigate('ConnectShopify')} /></View>
          <View style={{ flex: 1, marginLeft: 5 }}><Button title="WhatsApp" onPress={() => navigation.navigate('ConnectWhatsApp')} /></View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Confirmation Rules</Text>

        <View style={styles.row}>
          <Text>Enable Push Notifications</Text>
          <Switch value={settings?.enablePush} onValueChange={v => settingsApi.update({ enablePush: v }).then(r => setSettings(r.data))} />
        </View>

        <View style={styles.row}>
          <Text>Ignore Prepaid (only COD)</Text>
          <Switch value={rules.ignorePrepaid ?? true} onValueChange={v => updateRules({ ignorePrepaid: v })} />
        </View>

        <View style={styles.row}>
          <Text>Require Cancellation Approval</Text>
          <Switch value={rules.requireCancellationApproval ?? false} onValueChange={v => updateRules({ requireCancellationApproval: v })} />
        </View>

        <Text style={styles.label}>Min COD Value</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={String(rules.minCodValue ?? 0)} onChangeText={v => updateRules({ minCodValue: parseFloat(v) || 0 })} />

        <Text style={styles.label}>Max COD Value</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={String(rules.maxCodValue ?? 100000)} onChangeText={v => updateRules({ maxCodValue: parseFloat(v) || 100000 })} />

        <Text style={styles.label}>Send Delay (seconds)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={String(rules.sendDelaySeconds ?? 0)} onChangeText={v => updateRules({ sendDelaySeconds: parseInt(v) || 0 })} />

        <Text style={styles.label}>Reminder Count (0-5)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={String(rules.reminderCount ?? 2)} onChangeText={v => updateRules({ reminderCount: parseInt(v) || 0 })} />

        <Text style={styles.label}>Reminder Interval (minutes)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={String(rules.reminderIntervalMinutes ?? 60)} onChangeText={v => updateRules({ reminderIntervalMinutes: parseInt(v) || 60 })} />

        <Text style={styles.label}>Expiration (minutes)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={String(rules.expirationMinutes ?? 1440)} onChangeText={v => updateRules({ expirationMinutes: parseInt(v) || 1440 })} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Server</Text>
        <Text style={{ color: '#666', marginBottom: 8 }}>{getApiUrl()}</Text>
        <Button title="Change backend address" onPress={() => navigation.navigate('ServerSettings')} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Danger Zone</Text>
        <Button title="Logout" color="red" onPress={handleLogout} />
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 15 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  card: { backgroundColor: '#f8f9fa', padding: 15, borderRadius: 8, marginBottom: 15 },
  cardTitle: { fontWeight: 'bold', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 12, color: '#666', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, backgroundColor: '#fff' },
});
