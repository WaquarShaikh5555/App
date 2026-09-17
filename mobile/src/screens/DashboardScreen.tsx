import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { dashboardApi } from '../services/api';
import { cacheDashboard, getCachedDashboard } from '../services/storage';
import { useOffline } from '../hooks/useOffline';

export default function DashboardScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cached, setCached] = useState(false);
  const { isOffline } = useOffline();

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await dashboardApi.get();
      setData(res.data);
      await cacheDashboard(res.data);
      setCached(false);
    } catch (e) {
      // try cache
      const cachedData = await getCachedDashboard();
      if (cachedData) {
        setData(cachedData.data);
        setCached(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Loading dashboard...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text>No data. Pull to refresh.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {(isOffline || cached) && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Offline — showing cached data</Text>
        </View>
      )}

      <Text style={styles.title}>Today</Text>
      <View style={styles.row}>
        <View style={styles.card}><Text style={styles.cardValue}>{data.today?.orders ?? 0}</Text><Text style={styles.cardLabel}>Orders</Text></View>
        <View style={styles.card}><Text style={styles.cardValue}>{data.today?.codOrders ?? 0}</Text><Text style={styles.cardLabel}>COD Today</Text></View>
      </View>
      <View style={styles.row}>
        <View style={styles.card}><Text style={styles.cardValue}>{data.today?.awaiting ?? 0}</Text><Text style={styles.cardLabel}>Awaiting</Text></View>
        <View style={styles.card}><Text style={styles.cardValue}>{data.today?.confirmed ?? 0}</Text><Text style={styles.cardLabel}>Confirmed</Text></View>
      </View>

      <Text style={styles.title}>Totals</Text>
      <View style={styles.row}>
        <View style={styles.card}><Text style={styles.cardValue}>{data.totals?.codOrders ?? 0}</Text><Text style={styles.cardLabel}>Total COD</Text></View>
        <View style={styles.card}><Text style={styles.cardValue}>{data.totals?.awaiting ?? 0}</Text><Text style={styles.cardLabel}>Awaiting</Text></View>
      </View>
      <View style={styles.row}>
        <View style={styles.card}><Text style={styles.cardValue}>{data.totals?.confirmed ?? 0}</Text><Text style={styles.cardLabel}>Confirmed</Text></View>
        <View style={styles.card}><Text style={styles.cardValue}>{data.totals?.cancelled ?? 0}</Text><Text style={styles.cardLabel}>Cancelled</Text></View>
      </View>

      <Text style={styles.title}>Rates</Text>
      <View style={styles.statsCard}>
        <Text>Confirmation Rate: {data.rates?.confirmationRate ?? 0}%</Text>
        <Text>Cancellation Rate: {data.rates?.cancellationRate ?? 0}%</Text>
        <Text>No-Response Rate: {data.rates?.noResponseRate ?? 0}%</Text>
        <Text>WhatsApp Delivery: {data.rates?.whatsappDeliveryRate ?? 0}%</Text>
      </View>

      <View style={styles.estimatedCard}>
        <Text style={styles.estimatedTitle}>Estimated Impact (not guaranteed)</Text>
        <Text style={styles.smallNote}>{data.estimated?.note}</Text>
        <Text>Potential RTO Prevented: {data.estimated?.potentialRtoPrevented ?? 0} cancelled before ship</Text>
        <Text>Ready to Ship (confirmed): {data.estimated?.confirmedReadyToShip ?? 0}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 15 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  offlineBanner: { backgroundColor: '#FFF3CD', padding: 10, borderRadius: 6, marginBottom: 10 },
  offlineText: { color: '#856404', textAlign: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', marginTop: 15, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  card: { flex: 1, backgroundColor: '#f8f9fa', padding: 15, borderRadius: 8, marginHorizontal: 5, alignItems: 'center' },
  cardValue: { fontSize: 22, fontWeight: 'bold' },
  cardLabel: { fontSize: 12, color: '#666', marginTop: 5 },
  statsCard: { backgroundColor: '#e9ecef', padding: 15, borderRadius: 8 },
  estimatedCard: { backgroundColor: '#d4edda', padding: 15, borderRadius: 8, marginTop: 15, marginBottom: 30 },
  estimatedTitle: { fontWeight: 'bold', marginBottom: 5 },
  smallNote: { fontSize: 11, color: '#555', marginBottom: 10, fontStyle: 'italic' },
});
