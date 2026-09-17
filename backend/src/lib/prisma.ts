import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from './logger';

let prisma: PrismaClient;

if (config.mockMode && !config.databaseUrl) {
  // In mock mode without DB, we create a dummy client that will fail gracefully
  // But we still export it; routes will check mockMode and use in-memory if needed
  logger.warn('MOCK_MODE enabled and no DATABASE_URL — using in-memory fallback for dev');
}

try {
  prisma = new PrismaClient();
} catch (e) {
  // fallback for environments without DB
  logger.warn('Prisma client init failed, using mock');
  // @ts-ignore
  prisma = null;
}

export { prisma };

// Simple in-memory mock store for local dev when DATABASE_URL missing
type InMemoryStore = {
  users: any[];
  orgs: any[];
  memberships: any[];
  shops: any[];
  shopifyConnections: any[];
  whatsappConnections: any[];
  orders: any[];
  customers: any[];
  confirmationRequests: any[];
  messageAttempts: any[];
  webhookEvents: any[];
  auditLogs: any[];
  pushTokens: any[];
  notificationSettings: any[];
  messageTemplates: any[];
};

export const mockStore: InMemoryStore = {
  users: [],
  orgs: [],
  memberships: [],
  shops: [],
  shopifyConnections: [],
  whatsappConnections: [],
  orders: [],
  customers: [],
  confirmationRequests: [],
  messageAttempts: [],
  webhookEvents: [],
  auditLogs: [],
  pushTokens: [],
  notificationSettings: [],
  messageTemplates: [],
};

export function isMockMode(): boolean {
  return config.mockMode || !config.databaseUrl;
}
