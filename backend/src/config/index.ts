import dotenv from 'dotenv';
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me-32chars!!',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me-32chars!!',
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY || '',
    apiSecret: process.env.SHOPIFY_API_SECRET || '',
    appUrl: process.env.SHOPIFY_APP_URL || 'http://localhost:3000',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2026-07', // verified 2026-09-17 latest stable
    scopes: ['read_orders', 'write_orders', 'read_customers'].join(','), // minimal scopes
  },
  whatsapp: {
    appId: process.env.WHATSAPP_APP_ID || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v26.0', // verified latest Graph API v26.0 released 2026-07-29
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'orderconfirm_verify_token',
  },
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'exp://localhost:19000',
  mockMode: (process.env.MOCK_MODE || 'true') === 'true',
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || '',
};
