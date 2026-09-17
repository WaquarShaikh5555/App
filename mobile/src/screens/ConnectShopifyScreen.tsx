import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Linking, ActivityIndicator } from 'react-native';
import { shopifyApi } from '../services/api';
import * as WebBrowser from 'expo-web-browser';

export default function ConnectShopifyScreen() {
  const [shop, setShop] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await shopifyApi.status();
      setStatus(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnect = async () => {
    if (!shop) {
      Alert.alert('Error', 'Enter shop domain e.g. myshop.myshopify.com');
      return;
    }
    try {
      const res = await shopifyApi.getAuthUrl(shop);
      const url = res.data.authUrl;
      Alert.alert('Opening Shopify OAuth', url);
      await WebBrowser.openBrowserAsync(url);
      // After return, reload status
      setTimeout(loadStatus, 3000);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await shopifyApi.disconnect();
      Alert.alert('Disconnected');
      loadStatus();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Checking status...</Text></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shopify Connection</Text>
      {status?.connected ? (
        <View style={styles.connected}>
          <Text style={{ color: 'green' }}>Connected: {status.connection?.shopDomain || status.shop?.domain}</Text>
          <Text>Scopes: {status.connection?.scopes?.join(', ')}</Text>
          <Text>Status: {status.connection?.status}</Text>
          <View style={{ marginTop: 15 }}><Button title="Disconnect" color="red" onPress={handleDisconnect} /></View>
        </View>
      ) : (
        <View style={styles.disconnected}>
          <Text style={{ color: 'red', marginBottom: 10 }}>Not connected</Text>
          <TextInput style={styles.input} placeholder="myshop.myshopify.com" value={shop} onChangeText={setShop} autoCapitalize="none" />
          <Button title="Connect Shopify" onPress={handleConnect} />
          <Text style={styles.note}>Minimal scopes required: read_orders, write_orders, read_customers. OAuth flow opens in browser and completes on backend, then deep links back to app.</Text>
        </View>
      )}
      <View style={{ marginTop: 20 }}><Button title="Refresh Status" onPress={loadStatus} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 15 },
  connected: { backgroundColor: '#d4edda', padding: 15, borderRadius: 8 },
  disconnected: { backgroundColor: '#fff3cd', padding: 15, borderRadius: 8 },
  note: { fontSize: 11, color: '#666', marginTop: 10 },
});
