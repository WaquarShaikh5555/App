import { Router } from 'express';
import { verifyShopifyHmac } from '../lib/shopify';
import { verifyWhatsAppWebhookSignature } from '../lib/whatsapp';
import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { processShopifyOrderWebhook } from '../services/orderService';
import { transitionConfirmationRequest } from '../services/confirmationService';
import { logger } from '../lib/logger';
import { config } from '../config';
import { decrypt } from '../lib/encryption';
import { sendPushToOrg } from '../services/pushService';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Shopify orders/create webhook - needs raw body
router.post('/shopify/orders-create', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const webhookId = req.headers['x-shopify-webhook-id'] as string;
  const shopDomain = req.headers['x-shopify-shop-domain'] as string;
  const topic = req.headers['x-shopify-topic'] as string;

  // rawBody stored by middleware
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (!verifyShopifyHmac(rawBody, hmac || '')) {
    logger.warn(`Shopify HMAC verification failed for shop ${shopDomain}`);
    return res.status(401).send('HMAC verification failed');
  }

  const idempotencyKey = webhookId || `shopify_${shopDomain}_${topic}_${(req.body as any).id}_${Date.now()}`;
  const shopifyOrder = req.body;

  try {
    // find org by shop domain
    let orgId: string | null = null;
    let shopId: string | null = null;
    if (isMockMode()) {
      const shop = mockStore.shops.find(s => s.domain === shopDomain);
      if (shop) {
        orgId = shop.orgId;
        shopId = shop.id;
      } else {
        // fallback: first org
        if (mockStore.orgs.length > 0) {
          orgId = mockStore.orgs[0].id;
          shopId = mockStore.shops[0]?.id || null;
        }
      }
    } else {
      const conn = await prisma.shopifyConnection.findFirst({ where: { shopDomain } });
      if (conn) {
        orgId = conn.orgId;
        shopId = conn.shopId;
      } else {
        const shop = await prisma.shop.findFirst({ where: { domain: shopDomain } });
        if (shop) {
          orgId = shop.orgId;
          shopId = shop.id;
        }
      }
    }

    if (!orgId || !shopId) {
      logger.warn(`No org found for shop ${shopDomain}, storing webhook event for later`);
      // store event without org
      if (isMockMode()) {
        mockStore.webhookEvents.push({
          id: uuidv4(),
          orgId: null,
          source: 'shopify',
          topic: topic || 'orders/create',
          idempotencyKey,
          payload: shopifyOrder,
          hmacValid: true,
          processed: false,
          createdAt: new Date(),
        });
      } else {
        await prisma.webhookEvent.create({
          data: {
            source: 'shopify',
            topic: topic || 'orders/create',
            idempotencyKey,
            payload: shopifyOrder,
            hmacValid: true,
            processed: false,
          },
        });
      }
      return res.status(200).send('OK - no org yet');
    }

    const result = await processShopifyOrderWebhook(orgId, shopId, shopDomain, shopifyOrder, idempotencyKey);

    // mark processed
    if (isMockMode()) {
      const ev = mockStore.webhookEvents.find(e => e.idempotencyKey === idempotencyKey);
      if (ev) ev.processed = true;
    } else {
      await prisma.webhookEvent.updateMany({ where: { idempotencyKey }, data: { processed: true, orgId } });
    }

    res.status(200).send('OK');
  } catch (e: any) {
    logger.error(`Error processing Shopify webhook: ${e.message}`);
    res.status(500).send('Error');
  }
});

// WhatsApp webhook verification (GET)
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// WhatsApp webhook receiver (POST) - messages, statuses, button replies
router.post('/whatsapp', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (!verifyWhatsAppWebhookSignature(rawBody, signature || '')) {
    logger.warn('WhatsApp signature verification failed');
    // In mock mode allow
    if (!config.mockMode) {
      return res.status(401).send('Signature verification failed');
    }
  }

  const body = req.body;
  // idempotency key from message id or webhook id
  const entries = body.entry || [];
  try {
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value;
        const wabaId = value?.metadata?.phone_number_id ? entry.id : null; // simplified
        // Handle message statuses
        if (value.statuses) {
          for (const status of value.statuses) {
            const waMessageId = status.id;
            const statusType = status.status; // sent, delivered, read, failed
            logger.info(`WhatsApp status update: ${waMessageId} -> ${statusType}`);
            if (isMockMode()) {
              const attempt = mockStore.messageAttempts.find(a => a.waMessageId === waMessageId);
              if (attempt) {
                attempt.status = statusType.toUpperCase();
              }
            } else {
              await prisma.messageAttempt.updateMany({
                where: { waMessageId },
                data: { status: statusType.toUpperCase() },
              });
            }
          }
        }
        // Handle inbound messages (customer replies Confirm/Cancel)
        if (value.messages) {
          for (const msg of value.messages) {
            const from = msg.from; // customer's phone digits
            const type = msg.type;
            let replyText = '';
            if (type === 'button') {
              replyText = msg.button?.text || '';
            } else if (type === 'interactive') {
              replyText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
            } else if (type === 'text') {
              replyText = msg.text?.body || '';
            }

            logger.info(`WhatsApp inbound from ${from}: ${replyText} (type ${type})`);

            // Find confirmation request by phone
            // Normalize from to E164: +{from}
            const e164 = `+${from}`;
            let orgId: string | null = null;
            let confirmationRequest: any = null;
            let order: any = null;

            if (isMockMode()) {
              // find customer by phone
              const customer = mockStore.customers.find(c => c.phoneE164 === e164 || c.phoneE164?.replace(/\D/g,'') === from);
              if (customer) {
                // find latest awaiting confirmation request for this customer's orders
                const customerOrders = mockStore.orders.filter(o => o.customerId === customer.id);
                for (const o of customerOrders) {
                  const cr = mockStore.confirmationRequests
                    .filter(cr => cr.orderId === o.id && cr.status === 'AWAITING_CONFIRMATION')
                    .sort((a,b) => b.createdAt - a.createdAt)[0];
                  if (cr) {
                    confirmationRequest = cr;
                    order = o;
                    orgId = cr.orgId;
                    break;
                  }
                }
              }
            } else {
              const customer = await prisma.customer.findFirst({ where: { phoneE164: e164 } });
              if (customer) {
                const cr = await prisma.confirmationRequest.findFirst({
                  where: { orgId: customer.orgId, status: 'AWAITING_CONFIRMATION', order: { customerId: customer.id } },
                  orderBy: { createdAt: 'desc' },
                  include: { order: true },
                });
                if (cr) {
                  confirmationRequest = cr;
                  order = cr.order;
                  orgId = cr.orgId;
                }
              }
            }

            if (!confirmationRequest || !orgId) {
              logger.warn(`No awaiting confirmation found for phone ${from}`);
              continue;
            }

            const lower = replyText.toLowerCase();
            let newStatus: 'CONFIRMED' | 'CANCEL_REQUESTED' | null = null;
            if (lower.includes('confirm') || lower === 'yes' || lower === '1') {
              newStatus = 'CONFIRMED';
            } else if (lower.includes('cancel') || lower === 'no' || lower === '2') {
              newStatus = 'CANCEL_REQUESTED';
            }

            if (newStatus) {
              try {
                await transitionConfirmationRequest(orgId, confirmationRequest.id, newStatus, { type: 'webhook', id: 'whatsapp' }, { replyText, from });
                logger.info(`Transitioned CR ${confirmationRequest.id} to ${newStatus}`);

                // Update Shopify metafield
                let shopDomain: string | null = null;
                let accessToken: string | null = null;
                if (isMockMode()) {
                  const shopConn = mockStore.shopifyConnections.find(c => c.orgId === orgId);
                  if (shopConn) {
                    shopDomain = shopConn.shopDomain;
                    accessToken = shopConn.accessTokenEncrypted ? decrypt(shopConn.accessTokenEncrypted) : null;
                  }
                } else {
                  const shopConn = await prisma.shopifyConnection.findFirst({ where: { orgId } });
                  if (shopConn) {
                    shopDomain = shopConn.shopDomain;
                    accessToken = decrypt(shopConn.accessTokenEncrypted);
                  }
                }
                if (shopDomain && accessToken && order) {
                  // Update metafield
                  const { updateShopifyOrderMetafield } = await import('../lib/shopify');
                  await updateShopifyOrderMetafield(shopDomain, accessToken, order.shopifyOrderId, 'orderconfirm', 'confirmation_status', newStatus.toLowerCase(), 'single_line_text_field');
                }

                // Push notification to merchant
                const pushTitle = newStatus === 'CONFIRMED' ? 'Order confirmed by customer' : 'Cancellation requested';
                const pushBody = `Order ${order.name || order.shopifyOrderId} ${newStatus === 'CONFIRMED' ? 'confirmed' : 'cancel requested'} by ${from}`;
                await sendPushToOrg(orgId, { title: pushTitle, body: pushBody, data: { type: newStatus === 'CONFIRMED' ? 'confirmed' : 'cancel_requested', orderId: order.id } });

                // If cancellation requires approval, keep as CANCEL_REQUESTED, else auto CANCELLED
                if (newStatus === 'CANCEL_REQUESTED') {
                  let rules: any = {};
                  if (isMockMode()) {
                    rules = mockStore.notificationSettings.find(s => s.orgId === orgId)?.rules || {};
                  } else {
                    const settings = await prisma.notificationSetting.findUnique({ where: { orgId } });
                    rules = (settings?.rules as any) || {};
                  }
                  if (!rules.requireCancellationApproval) {
                    await transitionConfirmationRequest(orgId, confirmationRequest.id, 'CANCELLED', { type: 'system' }, { auto: true });
                    await sendPushToOrg(orgId, { title: 'Order cancelled', body: `Order ${order.name} cancelled`, data: { type: 'cancelled', orderId: order.id } });
                  }
                }
              } catch (e: any) {
                logger.error(`Failed to transition: ${e.message}`);
              }
            }

            // store webhook event
            const idempotencyKey = `wa_${msg.id}`;
            if (isMockMode()) {
              if (!mockStore.webhookEvents.find(e => e.idempotencyKey === idempotencyKey)) {
                mockStore.webhookEvents.push({
                  id: uuidv4(),
                  orgId,
                  source: 'whatsapp',
                  topic: 'messages',
                  idempotencyKey,
                  payload: msg,
                  hmacValid: true,
                  processed: true,
                  createdAt: new Date(),
                });
              }
            } else {
              const exists = await prisma.webhookEvent.findUnique({ where: { idempotencyKey } });
              if (!exists) {
                await prisma.webhookEvent.create({
                  data: {
                    orgId: orgId || undefined,
                    source: 'whatsapp',
                    topic: 'messages',
                    idempotencyKey,
                    payload: msg,
                    hmacValid: true,
                    processed: true,
                  },
                });
              }
            }
          }
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } catch (e: any) {
    logger.error(`WhatsApp webhook processing error: ${e.message}`);
    res.status(500).send('Error');
  }
});

export default router;
