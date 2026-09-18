import axios from 'axios';
import { getApiUrl, hostLabel, explainConnectionFailure } from './serverConfig';
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from './storage';

const api = axios.create({
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// The server address is read per request, so changing it in Settings applies immediately
// without restarting the app.
api.interceptors.request.use(async (config) => {
  config.baseURL = `${getApiUrl()}/api`;
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
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');
        const res = await axios.post(`${getApiUrl()}/api/auth/refresh`, { refreshToken });
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

/**
 * Turn an axios failure into something worth showing a user.
 *
 * The backend already returns readable messages ("Invalid credentials"), so those are passed
 * through; everything else (no network, wrong port, 500s) becomes an explanation instead of
 * axios' "Network Error".
 */
export function describeApiError(error: any): string {
  const serverError =
    typeof error?.response?.data?.error === 'string'
      ? error.response.data.error
      : typeof error?.response?.data?.message === 'string'
        ? error.response.data.message
        : undefined;

  if (error?.response) {
    const status = error.response.status;
    switch (status) {
      case 400:
        return serverError || 'Please check the details you entered.';
      case 401:
        return serverError && !/invalid credentials/i.test(serverError)
          ? serverError
          : 'Wrong email or password.';
      case 403:
        return serverError || 'This account is not allowed to do that.';
      case 409:
        return 'That email already has an account. Sign in instead.';
      case 429:
        return 'Too many attempts. Wait a minute and try again.';
      case 501:
        return serverError || 'That sign-in method is not set up on the server yet.';
      default:
        if (status >= 500) {
          return `The server had a problem (HTTP ${status}). Check the backend logs.`;
        }
        return serverError || `Request failed (HTTP ${status}).`;
    }
  }

  return explainConnectionFailure(error, getApiUrl());
}

export { hostLabel };
export default api;

// Auth
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (email: string, password: string, name?: string, orgName?: string) =>
    api.post('/auth/register', { email, password, name, orgName }),
  me: () => api.get('/auth/me'),
  google: (idToken: string) => api.post('/auth/google', { idToken }),
  logout: () => clearTokens(),
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
