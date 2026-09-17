import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { ordersApi } from '../services/api';
import { cacheOrders, getCachedOrders } from '../services/storage';
import { useOffline } from '../hooks/useOffline';

const FILTERS = ['ALL', 'AWAITING_CONFIRMATION', 'CONFIRMED', 'CANCELLED', 'FAILED', 'COD'];

export default function OrdersScreen({ navigation }: any) {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [cached, setCached] = useState(false);
  const { isOffline } = useOffline();

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const params: any = { limit: 50, offset: 0 };
      if (filter !== 'ALL') {
        if (filter === 'COD') params.isCod = true;
        else params.status = filter;
      }
      if (search) params.search = search;
      const res = await ordersApi.list(params);
      setOrders(res.data.orders || []);
      setTotal(res.data.total || 0);
      await cacheOrders(res.data);
      setCached(false);
    } catch (e) {
      const cachedData = await getCachedOrders();
      if (cachedData) {
        setOrders(cachedData.data.orders || []);
        setTotal(cachedData.data.total || 0);
        setCached(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}>
      <View style={{ flex: 1 }}>
        <Text style={styles.orderName}>{item.name || item.orderNumber || item.shopifyOrderId}</Text>
        <Text style={styles.orderMeta}>{item.isCod ? 'COD' : 'Prepaid'} • {item.financialStatus} • ₹{item.totalPrice}</Text>
        <Text style={styles.orderDate}>{new Date(item.createdAt).toLocaleString()}</Text>
      </View>
      <View style={[styles.badge, badgeColor(item.confirmationStatus)]}>
        <Text style={styles.badgeText}>{item.confirmationStatus}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /><Text>Loading orders...</Text></View>;
  }

  return (
    <View style={styles.container}>
      {(isOffline || cached) && <View style={styles.offlineBanner}><Text style={styles.offlineText}>Offline — showing cached data (read-only)</Text></View>}

      <View style={styles.filterRow}>
        <FlatList horizontal data={FILTERS} keyExtractor={i => i} renderItem={({ item }) => (
          <TouchableOpacity style={[styles.filterChip, filter === item && styles.filterChipActive]} onPress={() => setFilter(item)}>
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
          </TouchableOpacity>
        )} showsHorizontalScrollIndicator={false} />
      </View>

      <TextInput style={styles.search} placeholder="Search order #, customer, phone" value={search} onChangeText={setSearch} onSubmitEditing={() => load()} />

      <Text style={styles.totalText}>{total} orders</Text>

      <FlatList
        data={orders}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<View style={styles.center}><Text>No orders found</Text></View>}
      />
    </View>
  );
}

function badgeColor(status: string) {
  switch (status) {
    case 'CONFIRMED': return { backgroundColor: '#d4edda' };
    case 'AWAITING_CONFIRMATION': return { backgroundColor: '#fff3cd' };
    case 'CANCELLED': case 'CANCEL_REQUESTED': return { backgroundColor: '#f8d7da' };
    case 'FAILED': return { backgroundColor: '#f5c6cb' };
    case 'EXPIRED': return { backgroundColor: '#e2e3e5' };
    default: return { backgroundColor: '#e9ecef' };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  offlineBanner: { backgroundColor: '#FFF3CD', padding: 8, borderRadius: 6, marginBottom: 8 },
  offlineText: { color: '#856404', textAlign: 'center', fontSize: 12 },
  filterRow: { marginBottom: 10 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#e9ecef', marginRight: 8 },
  filterChipActive: { backgroundColor: '#25D366' },
  filterText: { fontSize: 12 },
  filterTextActive: { color: '#fff' },
  search: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10 },
  totalText: { fontSize: 12, color: '#666', marginBottom: 5 },
  item: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  orderName: { fontWeight: 'bold', fontSize: 14 },
  orderMeta: { fontSize: 12, color: '#555', marginTop: 2 },
  orderDate: { fontSize: 11, color: '#999', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginLeft: 10 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
});
