import crypto from 'crypto';
import { config } from '../config';
import { logger } from './logger';

export function verifyShopifyHmac(rawBody: string | Buffer, hmacHeader: string): boolean {
  const secret = config.shopify.apiSecret;
  if (!secret) {
    logger.warn('Shopify secret missing, skipping HMAC verification in dev');
    return config.mockMode ? true : false;
  }
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const digest = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export function buildShopifyAuthUrl(shop: string, state: string): string {
  const { apiKey, scopes, appUrl } = config.shopify;
  const redirectUri = `${appUrl}/api/shopify/callback`;
  const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  return `https://${shopDomain}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
}

export async function exchangeCodeForToken(shop: string, code: string): Promise<{ access_token: string; scope: string }> {
  if (config.mockMode && (!config.shopify.apiKey || !config.shopify.apiSecret)) {
    logger.info('MOCK_MODE: returning fake Shopify token');
    return { access_token: `mock_token_${shop}_${Date.now()}`, scope: config.shopify.scopes };
  }
  const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  const url = `https://${shopDomain}/admin/oauth/access_token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.shopify.apiKey,
      client_secret: config.shopify.apiSecret,
      code,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Shopify token exchange failed: ${res.status} ${txt}`);
  }
  return res.json() as any;
}

export async function registerShopifyWebhook(shopDomain: string, accessToken: string, topic: string, address: string): Promise<string | null> {
  if (config.mockMode) {
    logger.info(`MOCK_MODE: would register webhook ${topic} -> ${address} for ${shopDomain}`);
    return `mock_webhook_${Date.now()}`;
  }
  const url = `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/webhooks.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({
      webhook: {
        topic,
        address,
        format: 'json',
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    logger.error(`Failed to register webhook ${topic}: ${txt}`);
    return null;
  }
  const data = await res.json() as any;
  return data.webhook?.id?.toString() || null;
}

export async function updateShopifyOrderMetafield(shopDomain: string, accessToken: string, orderId: string, namespace: string, key: string, value: string, type: string = 'single_line_text_field'): Promise<boolean> {
  if (config.mockMode) {
    logger.info(`MOCK_MODE: would update order ${orderId} metafield ${namespace}.${key}=${value}`);
    return true;
  }
  // GraphQL Admin API 2026-07
  const url = `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`;
  const mutation = `
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }
  `;
  const variables = {
    metafields: [
      {
        ownerId: `gid://shopify/Order/${orderId}`,
        namespace,
        key,
        value,
        type,
      },
    ],
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });
  if (!res.ok) {
    const txt = await res.text();
    logger.error(`Shopify metafield update failed: ${txt}`);
    return false;
  }
  const data = await res.json() as any;
  if (data.errors || data.data?.metafieldsSet?.userErrors?.length) {
    logger.error(`Shopify metafield userErrors: ${JSON.stringify(data)}`);
    return false;
  }
  return true;
}

export async function addShopifyOrderNote(shopDomain: string, accessToken: string, orderId: string, note: string): Promise<boolean> {
  if (config.mockMode) {
    logger.info(`MOCK_MODE: would add note to order ${orderId}: ${note}`);
    return true;
  }
  const url = `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/orders/${orderId}.json`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ order: { id: orderId, note } }),
  });
  return res.ok;
}
