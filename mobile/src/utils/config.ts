import Constants from 'expo-constants';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || 'http://10.0.2.2:3000';

export const APP_SCHEME = 'orderconfirm';
