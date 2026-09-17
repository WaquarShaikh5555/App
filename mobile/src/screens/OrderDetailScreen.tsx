import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Button, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { ordersApi } from '../services/api';

export default function OrderDetailScreen({ route }: any) {
  const { orderId } = route.params;
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await ordersApi.detail(orderId);
      setDetail(res.data);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orderId]);

  const handleReveal = async () => {
    try {
      const res = await ordersApi.revealPhone(orderId);
      setRevealedPhone(res.data.phone);
      Alert.alert('Phone Revealed', 'Action logged in audit trail');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const handleConfirm = async () => {
    try {
      await ordersApi.confirm(orderId);
      Alert.alert('Confirmed', 'Order marked confirmed');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const handleCancel = async () => {
    Alert.alert('Cancel Order', 'Are you sure?', [
      { text: 'No' },
      { text: 'Yes', onPress: async () => {
        try {
          await ordersApi.cancel(orderId);
          Alert.alert('Cancelled');
          load();
        } catch (e: any) {
          Alert.alert('Error', e.response?.data?.error || e.message);
        }
      }},
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /><Text>Loading order...</Text></View>;
  if (!detail) return <View style={styles.center}><Text>Order not found</Text></View>;

  const { order, customer, confirmationRequests, messageAttempts, auditLogs } = detail;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{order.name || order.shopifyOrderId}</Text>
        <Text>Status: {order.confirmationStatus}</Text>
        <Text>COD: {order.isCod ? 'Yes' : 'No'}</Text>
        <Text>Total: {order.currency} {order.totalPrice}</Text>
        <Text>Financial: {order.financialStatus}</Text>
        <Text>Fulfillment: {order.fulfillmentStatus}</Text>
        <Text>Created: {new Date(order.createdAt).toLocaleString()}</Text>
        {order.createdAtShopify && <Text>Shopify Created: {new Date(order.createdAtShopify).toLocaleString()}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Customer</Text>
        <Text>Name: {customer?.name || 'N/A'}</Text>
        <Text>Email: {customer?.email || 'N/A'}</Text>
        <Text>Phone (masked): {customer?.phoneMasked || 'N/A'}</Text>
        {revealedPhone ? <Text style={{ fontWeight: 'bold' }}>Full Phone: {revealedPhone}</Text> : null}
        <TouchableOpacity style={styles.revealBtn} onPress={handleReveal}>
          <Text style={styles.revealText}>Reveal Phone (logged)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Confirmation History</Text>
        {confirmationRequests?.length ? confirmationRequests.map((cr: any) => (
          <View key={cr.id} style={styles.historyItem}>
            <Text>Status: {cr.status}</Text>
            <Text>Created: {new Date(cr.createdAt).toLocaleString()}</Text>
            {cr.confirmedAt && <Text>Confirmed: {new Date(cr.confirmedAt).toLocaleString()}</Text>}
            {cr.cancelledAt && <Text>Cancelled: {new Date(cr.cancelledAt).toLocaleString()}</Text>}
            {cr.expiresAt && <Text>Expires: {new Date(cr.expiresAt).toLocaleString()}</Text>}
          </View>
        )) : <Text>No confirmation requests</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Message Attempts</Text>
        {messageAttempts?.length ? messageAttempts.map((ma: any) => (
          <View key={ma.id} style={styles.historyItem}>
            <Text>To: {ma.toPhone}</Text>
            <Text>Template: {ma.templateName}</Text>
            <Text>Status: {ma.status}</Text>
            {ma.waMessageId && <Text>WA ID: {ma.waMessageId}</Text>}
            {ma.errorMessage && <Text style={{ color: 'red' }}>Error: {ma.errorMessage}</Text>}
            <Text>Sent: {new Date(ma.sentAt).toLocaleString()}</Text>
          </View>
        )) : <Text>No messages</Text>}
      </View>

      {auditLogs && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Audit Trail (last 50)</Text>
          {auditLogs.map((log: any) => (
            <View key={log.id} style={styles.historyItem}>
              <Text>{log.action} by {log.actorType} {log.actorId || ''}</Text>
              <Text style={{ fontSize: 11 }}>{new Date(log.createdAt).toLocaleString()}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <Button title="Confirm Order" onPress={handleConfirm} />
        <View style={{ height: 10 }} />
        <Button title="Cancel Order" color="red" onPress={handleCancel} />
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#f8f9fa', padding: 15, borderRadius: 8, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  historyItem: { backgroundColor: '#fff', padding: 10, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  revealBtn: { marginTop: 10, backgroundColor: '#e9ecef', padding: 10, borderRadius: 6, alignItems: 'center' },
  revealText: { color: '#007bff' },
  actions: { marginTop: 10 },
});
