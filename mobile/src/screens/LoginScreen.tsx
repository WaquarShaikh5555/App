import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { authApi } from '../services/api';
import { saveTokens, saveUser, saveOrg } from '../services/storage';
import { registerForPushNotificationsAsync, setupNotificationChannels } from '../services/notifications';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Enter email and password');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      const { accessToken, refreshToken, user, org } = res.data;
      await saveTokens(accessToken, refreshToken);
      await saveUser(user);
      await saveOrg(org);
      setupNotificationChannels();
      await registerForPushNotificationsAsync();
      // Navigate to main - need to reload app navigator state
      // For MVP, just alert and ask to restart or navigate
      Alert.alert('Success', 'Logged in', [{ text: 'Continue', onPress: () => navigation.replace('MainTabs') }]);
    } catch (e: any) {
      Alert.alert('Login failed', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OrderConfirm</Text>
      <Text style={styles.subtitle}>Confirm COD orders before you ship them</Text>

      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

      {loading ? <ActivityIndicator /> : <Button title="Login" onPress={handleLogin} />}

      <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: 20 }}>
        <Text style={{ color: '#25D366', textAlign: 'center' }}>Don't have account? Register</Text>
      </TouchableOpacity>

      <View style={styles.note}>
        <Text style={styles.noteText}>MVP Note: Backend must be running. Set EXPO_PUBLIC_API_URL in eas.json / env.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },
  subtitle: { fontSize: 14, textAlign: 'center', color: '#666', marginBottom: 30 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 15 },
  note: { marginTop: 30, padding: 10, backgroundColor: '#f0f0f0', borderRadius: 8 },
  noteText: { fontSize: 12, color: '#555' },
});
