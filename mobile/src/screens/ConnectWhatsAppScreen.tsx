import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { whatsappApi, templatesApi } from '../services/api';
import * as WebBrowser from 'expo-web-browser';

export default function ConnectWhatsAppScreen() {
  const [status, setStatus] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState({ wabaId: '', phoneNumberId: '', accessToken: '', displayPhone: '' });
  const [testPhone, setTestPhone] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await whatsappApi.status();
      setStatus(res.data);
      const tRes = await templatesApi.list();
      setTemplates(tRes.data.templates || []);
    } catch (e) {
      console.log(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleStartAuth = async () => {
    try {
      const res = await whatsappApi.startAuth();
      const url = res.data.authUrl;
      Alert.alert('Opening WhatsApp Auth', url);
      await WebBrowser.openBrowserAsync(url);
      setTimeout(load, 3000);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const handleManualConnect = async () => {
    if (!manual.wabaId || !manual.phoneNumberId || !manual.accessToken) {
      Alert.alert('Error', 'All fields required');
      return;
    }
    try {
      const res = await whatsappApi.connectManual({
        wabaId: manual.wabaId,
        phoneNumberId: manual.phoneNumberId,
        accessToken: manual.accessToken,
        displayPhoneNumber: manual.displayPhone,
      });
      Alert.alert('Connected', JSON.stringify(res.data));
      load();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const handleTest = async () => {
    if (!testPhone) {
      Alert.alert('Error', 'Enter phone');
      return;
    }
    try {
      const res = await whatsappApi.testMessage(testPhone);
      Alert.alert('Test Result', JSON.stringify(res.data));
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await whatsappApi.disconnect();
      Alert.alert('Disconnected');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading WhatsApp status...</Text></View>;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>WhatsApp Business Connection</Text>
      <Text style={styles.subtitle}>Official Cloud API only. No WhatsApp Web automation.</Text>

      {status?.connected ? (
        <View style={styles.connected}>
          <Text style={{ color: 'green' }}>Connected</Text>
          <Text>WABA ID: {status.wabaId}</Text>
          <Text>Phone ID: {status.phoneNumberId}</Text>
          <Text>Display: {status.displayPhoneNumber}</Text>
          <Text>Template Status: {status.templateStatus}</Text>
          <View style={{ marginTop: 10 }}><Button title="Disconnect" color="red" onPress={handleDisconnect} /></View>
        </View>
      ) : (
        <View style={styles.disconnected}>
          <Text style={{ color: 'red' }}>Not connected</Text>
          <View style={{ marginTop: 10 }}><Button title="Connect via Meta OAuth" onPress={handleStartAuth} /></View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Manual Connect (for testing / local dev)</Text>
        <TextInput style={styles.input} placeholder="WABA ID" value={manual.wabaId} onChangeText={v => setManual({ ...manual, wabaId: v })} />
        <TextInput style={styles.input} placeholder="Phone Number ID" value={manual.phoneNumberId} onChangeText={v => setManual({ ...manual, phoneNumberId: v })} />
        <TextInput style={styles.input} placeholder="Access Token" value={manual.accessToken} onChangeText={v => setManual({ ...manual, accessToken: v })} secureTextEntry />
        <TextInput style={styles.input} placeholder="Display Phone (optional)" value={manual.displayPhone} onChangeText={v => setManual({ ...manual, displayPhone: v })} />
        <Button title="Connect Manually" onPress={handleManualConnect} />
        <Text style={styles.note}>Tokens are encrypted at rest (AES-256-GCM) on backend. Never stored on device.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Templates</Text>
        {templates.length ? templates.map(t => (
          <View key={t.id} style={styles.templateItem}>
            <Text style={{ fontWeight: 'bold' }}>{t.name} ({t.language})</Text>
            <Text>Status: {t.status} — do not claim approved when Meta hasn't approved it. Real status from Meta API.</Text>
            <Text>Category: {t.category}</Text>
          </View>
        )) : <Text>No templates. In mock mode, one approved template 'order_confirm_cod' is auto-created.</Text>}
        <Text style={styles.note}>Only approved templates can be sent. Handle rejection gracefully. Template approval can take time.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Test Message</Text>
        <TextInput style={styles.input} placeholder="+919876543210" value={testPhone} onChangeText={setTestPhone} keyboardType="phone-pad" />
        <Button title="Send Test Template" onPress={handleTest} />
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 15 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 5 },
  subtitle: { fontSize: 12, color: '#666', marginBottom: 15 },
  connected: { backgroundColor: '#d4edda', padding: 15, borderRadius: 8, marginBottom: 15 },
  disconnected: { backgroundColor: '#fff3cd', padding: 15, borderRadius: 8, marginBottom: 15 },
  card: { backgroundColor: '#f8f9fa', padding: 15, borderRadius: 8, marginBottom: 15 },
  cardTitle: { fontWeight: 'bold', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10, backgroundColor: '#fff' },
  note: { fontSize: 11, color: '#666', marginTop: 8, fontStyle: 'italic' },
  templateItem: { backgroundColor: '#fff', padding: 10, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
});
