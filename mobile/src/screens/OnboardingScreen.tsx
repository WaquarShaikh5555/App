import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function OnboardingScreen({ navigation }: any) {
  // Reachable both before and after signing in; only the signed-in navigator has these routes.
  const signedIn = navigation.getState?.().routeNames?.includes('MainTabs') ?? false;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to OrderConfirm</Text>
      <Text style={styles.text}>Reduce COD returns by confirming orders via WhatsApp before shipping.</Text>
      <Text style={styles.bullet}>1. Connect your Shopify store</Text>
      <Text style={styles.bullet}>2. Connect WhatsApp Business (Cloud API)</Text>
      <Text style={styles.bullet}>3. We auto-send confirmation requests for COD orders</Text>
      <Text style={styles.bullet}>4. Customer confirms/cancels in WhatsApp</Text>
      <Text style={styles.note}>We never guarantee fewer returns. We help you confirm intent before shipping. You measure RTO vs your own history.</Text>
      {signedIn ? (
        <>
          <Button title="Connect Shopify" onPress={() => navigation.navigate('ConnectShopify')} />
          <View style={{ height: 10 }} />
          <Button title="Go to Dashboard" onPress={() => navigation.navigate('MainTabs')} />
        </>
      ) : (
        <>
          <Button title="Sign in to get started" onPress={() => navigation.navigate('Login')} />
          <View style={{ height: 10 }} />
          <Button title="Create an account" onPress={() => navigation.navigate('Register')} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  text: { fontSize: 16, marginBottom: 15, textAlign: 'center' },
  bullet: { fontSize: 14, marginBottom: 8 },
  note: { fontSize: 12, color: '#666', marginVertical: 20, fontStyle: 'italic' },
});
