import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { sendPushNotifications } from '../lib/push';
import { logger } from '../lib/logger';

export async function sendPushToOrg(orgId: string, notification: { title: string; body: string; data?: any }) {
  let tokens: string[] = [];
  if (isMockMode()) {
    tokens = mockStore.pushTokens.filter((t: any) => t.orgId === orgId).map((t: any) => t.expoPushToken);
  } else {
    const pushTokens = await prisma.devicePushToken.findMany({ where: { orgId } });
    tokens = pushTokens.map((t: any) => t.expoPushToken);
  }
  if (tokens.length === 0) {
    logger.info(`No push tokens for org ${orgId}`);
    return;
  }
  const messages = tokens.map(to => ({
    to,
    title: notification.title,
    body: notification.body,
    data: notification.data,
  }));
  await sendPushNotifications(messages);
}

export async function registerPushToken(userId: string, orgId: string, expoPushToken: string, platform?: string) {
  if (isMockMode()) {
    const existing = mockStore.pushTokens.find((t: any) => t.expoPushToken === expoPushToken);
    if (existing) {
      existing.lastActive = new Date();
      existing.orgId = orgId;
      existing.userId = userId;
      return existing;
    }
    const token = { id: `pt_${Date.now()}`, userId, orgId, expoPushToken, platform, lastActive: new Date(), createdAt: new Date() };
    mockStore.pushTokens.push(token);
    return token;
  }
  return prisma.devicePushToken.upsert({
    where: { expoPushToken },
    create: { userId, orgId, expoPushToken, platform },
    update: { userId, orgId, lastActive: new Date(), platform },
  });
}
