import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { config } from './config';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error';

import authRoutes from './routes/auth';
import shopifyRoutes from './routes/shopify';
import whatsappRoutes from './routes/whatsapp';
import webhookRoutes from './routes/webhooks';
import orderRoutes from './routes/orders';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import pushRoutes from './routes/push';
import templateRoutes from './routes/templates';
import { startJobs } from './jobs/expiration';

dotenv.config();

const app = express();

// Trust proxy for ngrok / vercel
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Middleware to capture raw body for HMAC verification
app.use('/api/webhooks', express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0', shopifyApiVersion: config.shopify.apiVersion, whatsappApiVersion: config.whatsapp.apiVersion, mockMode: config.mockMode });
});

app.get('/', (req, res) => {
  res.json({ name: 'OrderConfirm Backend', version: '0.1.0', docs: '/health' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/shopify', shopifyRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/templates', templateRoutes);

// Unknown API routes get a JSON message the app can display (not an HTML 404)
app.use('/api', notFoundHandler);

// Error handler
app.use(errorHandler);

const port = config.port;
app.listen(port, '0.0.0.0', () => {
  logger.info(`OrderConfirm backend listening on 0.0.0.0:${port} (Shopify ${config.shopify.apiVersion}, WhatsApp ${config.whatsapp.apiVersion}, mockMode=${config.mockMode})`);
  startJobs();
});

export default app;
