import { Expo } from 'expo-server-sdk';
import { config } from '../config';
import { logger } from './logger';

const expo = new Expo({ accessToken: config.expoAccessToken || undefined });

export interface PushMessage {
  to: string; // expo push token
  title: string;
  body: string;
  data?: any;
  channelId?: string;
}

export async function sendPushNotifications(messages: PushMessage[]): Promise<void> {
  if (config.mockMode && !config.expoAccessToken) {
    logger.info(`MOCK_MODE: would send push: ${JSON.stringify(messages)}`);
    return;
  }

  const chunks = expo.chunkPushNotifications(
    messages.map(m => ({
      to: m.to,
      sound: 'default',
      title: m.title,
      body: m.body,
      data: m.data || {},
      channelId: m.channelId || 'orderconfirm-default',
    }))
  );

  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      logger.info(`Push receipts: ${JSON.stringify(receipts)}`);
    } catch (e: any) {
      logger.error(`Push send error: ${e.message}`);
    }
  }
}

export function isValidExpoPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}
