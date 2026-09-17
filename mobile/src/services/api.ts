import axios from 'axios';
import { API_URL } from '../utils/config';
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from './storage';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');
        const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefresh } = res.data;
        await saveTokens(accessToken, newRefresh);
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (e) {
        await clearTokens();
        // Let caller handle logout
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (email: string, password: string, name?: string, orgName?: string) => api.post('/auth/register', { email, password, name, orgName }),
};

// Dashboard
export const dashboardApi = {
  get: () => api.get('/dashboard'),
};

// Orders
export const ordersApi = {
  list: (params?: any) => api.get('/orders', { params }),
  detail: (id: string, reveal?: boolean) => api.get(`/orders/${id}`, { params: { reveal } }),
  revealPhone: (id: string) => api.post(`/orders/${id}/reveal-phone`),
  confirm: (id: string) => api.post(`/orders/${id}/confirm`),
  cancel: (id: string) => api.post(`/orders/${id}/cancel`),
};

// Shopify
export const shopifyApi = {
  getAuthUrl: (shop: string) => api.get('/shopify/auth', { params: { shop } }),
  status: () => api.get('/shopify/status'),
  disconnect: () => api.post('/shopify/disconnect'),
};

// WhatsApp
export const whatsappApi = {
  startAuth: () => api.get('/whatsapp/auth/start'),
  status: () => api.get('/whatsapp/status'),
  disconnect: () => api.post('/whatsapp/disconnect'),
  connectManual: (data: any) => api.post('/whatsapp/connect-manual', data),
  testMessage: (to: string, templateName?: string) => api.post('/whatsapp/test-message', { to, templateName }),
};

// Settings
export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: any) => api.put('/settings', data),
};

// Templates
export const templatesApi = {
  list: () => api.get('/templates'),
};

// Push
export const pushApi = {
  register: (expoPushToken: string, platform?: string) => api.post('/push/register', { expoPushToken, platform }),
};
