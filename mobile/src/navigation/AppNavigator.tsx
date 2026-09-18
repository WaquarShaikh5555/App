import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppState, Text, View, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import { getAccessToken } from '../services/storage';
import { loadApiUrl } from '../services/serverConfig';
import { onSessionChange } from '../services/session';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import DashboardScreen from '../screens/DashboardScreen';
import OrdersScreen from '../screens/OrdersScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ConnectShopifyScreen from '../screens/ConnectShopifyScreen';
import ConnectWhatsAppScreen from '../screens/ConnectWhatsAppScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ServerSettingsScreen from '../screens/ServerSettingsScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Onboarding: undefined;
  MainTabs: undefined;
  OrderDetail: { orderId: string };
  ConnectShopify: undefined;
  ConnectWhatsApp: undefined;
  ServerSettings: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Orders: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarLabel: 'Dashboard' }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ tabBarLabel: 'Orders' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: 'Settings' }} />
    </Tab.Navigator>
  );
}

const prefix = Linking.createURL('/');
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [prefix, 'orderconfirm://', 'https://orderconfirm.app'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Dashboard: 'dashboard',
          Orders: 'orders',
          Settings: 'settings',
        },
      },
      OrderDetail: 'order/:orderId',
      ConnectShopify: 'connect-shopify',
      ConnectWhatsApp: 'connect-whatsapp',
      Login: 'login',
      ServerSettings: 'server',
    },
  },
};

export default function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  const refreshSession = useCallback(async () => {
    const token = await getAccessToken();
    setIsAuthed(!!token);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    const check = async () => {
      // Load the saved server address before the first request goes out.
      await loadApiUrl();
      if (!active) return;
      await refreshSession();
    };
    check();

    // Sign-in and sign-out now re-run this check, so the navigator swaps between the auth
    // screens and the app itself. Previously the token was read once on mount, which left
    // MainTabs unregistered after a successful login and made login look broken.
    const unsubscribeSession = onSessionChange(() => {
      refreshSession();
    });

    // Re-check when the app comes back to the foreground (token may have expired).
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshSession();
    });

    return () => {
      active = false;
      unsubscribeSession();
      appStateSub.remove();
    };
  }, [refreshSession]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading OrderConfirm...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking} fallback={<Text>Loading...</Text>}>
      <Stack.Navigator screenOptions={{ headerShown: true }}>
        {!isAuthed ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create Account' }} />
            <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} options={{ title: 'Server' }} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: 'How it works' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Order Detail' }} />
            <Stack.Screen name="ConnectShopify" component={ConnectShopifyScreen} options={{ title: 'Connect Shopify' }} />
            <Stack.Screen name="ConnectWhatsApp" component={ConnectWhatsAppScreen} options={{ title: 'Connect WhatsApp' }} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: 'Welcome' }} />
            <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} options={{ title: 'Server' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
