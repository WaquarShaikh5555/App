import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { isCodOrder } from '../lib/codDetection';
import { normalizePhone } from '../lib/phone';
import { maskPhone, encrypt, decrypt } from '../lib/encryption';
import { sendWhatsAppTemplate } from '../lib/whatsapp';
import { createConfirmationRequest } from './confirmationService';
import { logger } from '../lib/logger';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import { sendPushToOrg } from './pushService';

export async function processShopifyOrderWebhook(orgId: string, shopId: string, shopDomain: string, shopifyOrder: any, idempotencyKey: string) {
  // idempotency check
  if (isMockMode()) {
    if (mockStore.webhookEvents.find(e => e.idempotencyKey === idempotencyKey)) {
      logger.info(`Duplicate webhook ${idempotencyKey} ignored`);
      return { duplicate: true };
    }
    mockStore.webhookEvents.push({
      id: uuidv4(),
      orgId,
      source: 'shopify',
      topic: 'orders/create',
      idempotencyKey,
      payload: shopifyOrder,
      hmacValid: true,
      processed: false,
      createdAt: new Date(),
    });
  } else {
    const existing = await prisma.webhookEvent.findUnique({ where: { idempotencyKey } });
    if (existing) {
      logger.info(`Duplicate webhook ${idempotencyKey} ignored`);
      return { duplicate: true };
    }
    await prisma.webhookEvent.create({
      data: {
        orgId,
        source: 'shopify',
        topic: 'orders/create',
        idempotencyKey,
        payload: shopifyOrder,
        hmacValid: true,
        processed: false,
      },
    });
  }

  // COD detection
  const isCod = isCodOrder(shopifyOrder);
  logger.info(`Order ${shopifyOrder.id} COD detection: ${isCod}`);

  // Load notification settings
  let settings: any = null;
  if (isMockMode()) {
    settings = mockStore.notificationSettings.find(s => s.orgId === orgId);
  } else {
    settings = await prisma.notificationSetting.findUnique({ where: { orgId } });
  }
  const rules = settings?.rules || {};
  const minCod = rules.minCodValue ?? 0;
  const maxCod = rules.maxCodValue ?? 1000000;
  const ignorePrepaid = rules.ignorePrepaid ?? true;
  const total = parseFloat(shopifyOrder.total_price || '0');

  if (ignorePrepaid && !isCod) {
    logger.info(`Order ${shopifyOrder.id} ignored (prepaid and ignorePrepaid=true)`);
    return { ignored: true, reason: 'prepaid' };
  }
  if (total < minCod || total > maxCod) {
    logger.info(`Order ${shopifyOrder.id} ignored due to value ${total} outside [${minCod}, ${maxCod}]`);
    return { ignored: true, reason: 'value_out_of_range' };
  }

  // Customer phone
  const rawPhone = shopifyOrder.phone || shopifyOrder.customer?.phone || shopifyOrder.shipping_address?.phone || shopifyOrder.billing_address?.phone || '';
  const normalized = normalizePhone(rawPhone);
  if (!normalized) {
    logger.warn(`Order ${shopifyOrder.id} no valid phone: ${rawPhone}`);
  }

  // Create or update customer, order
  let customer: any;
  let order: any;

  if (isMockMode()) {
    // customer
    customer = mockStore.customers.find(c => c.shopId === shopId && (c.shopifyCustomerId === shopifyOrder.customer?.id?.toString() || c.phoneE164 === normalized));
    if (!customer) {
      customer = {
        id: uuidv4(),
        orgId,
        shopId,
        shopifyCustomerId: shopifyOrder.customer?.id?.toString() || null,
        phoneE164: normalized,
        phoneMasked: normalized ? maskPhone(normalized) : null,
        name: shopifyOrder.customer ? `${shopifyOrder.customer.first_name || ''} ${shopifyOrder.customer.last_name || ''}`.trim() : shopifyOrder.shipping_address?.name || null,
        email: shopifyOrder.email || shopifyOrder.customer?.email || null,
        consent: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockStore.customers.push(customer);
    }
    // order
    order = mockStore.orders.find(o => o.shopId === shopId && o.shopifyOrderId === shopifyOrder.id.toString());
    if (!order) {
      order = {
        id: uuidv4(),
        orgId,
        shopId,
        shopifyOrderId: shopifyOrder.id.toString(),
        orderNumber: shopifyOrder.order_number?.toString() || null,
        name: shopifyOrder.name,
        financialStatus: shopifyOrder.financial_status,
        fulfillmentStatus: shopifyOrder.fulfillment_status,
        totalPrice: total,
        currency: shopifyOrder.currency,
        paymentGateway: shopifyOrder.gateway,
        paymentGatewayNames: shopifyOrder.payment_gateway_names || [],
        isCod,
        confirmationStatus: 'NEW',
        customerId: customer.id,
        rawPayload: shopifyOrder,
        createdAtShopify: shopifyOrder.created_at ? new Date(shopifyOrder.created_at) : new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockStore.orders.push(order);
    }

    // If COD, create confirmation request and send WhatsApp
    if (isCod && normalized) {
      const expiresAt = new Date(Date.now() + (rules.expirationMinutes || 1440) * 60 * 1000);
      const cr = await createConfirmationRequest(orgId, order.id, expiresAt);
      order.confirmationStatus = 'AWAITING_CONFIRMATION';
      // Send WhatsApp
      await sendWhatsAppForOrder(orgId, shopId, order, customer, cr);
      // push notification
      await sendPushToOrg(orgId, {
        title: 'New COD order awaiting confirmation',
        body: `Order ${order.name} - ${customer.name || normalized} - ₹${total}`,
        data: { type: 'new_order', orderId: order.id },
      });
      return { order, confirmationRequest: cr };
    }
    return { order };
  } else {
    // real DB path
    // customer
    customer = await prisma.customer.findFirst({
      where: { shopId, OR: [{ shopifyCustomerId: shopifyOrder.customer?.id?.toString() }, { phoneE164: normalized || undefined }] },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          orgId,
          shopId,
          shopifyCustomerId: shopifyOrder.customer?.id?.toString(),
          phoneE164: normalized,
          phoneMasked: normalized ? maskPhone(normalized) : null,
          name: shopifyOrder.customer ? `${shopifyOrder.customer.first_name || ''} ${shopifyOrder.customer.last_name || ''}`.trim() : shopifyOrder.shipping_address?.name,
          email: shopifyOrder.email || shopifyOrder.customer?.email,
          consent: false,
        },
      });
    }
    // order
    order = await prisma.order.upsert({
      where: { shopId_shopifyOrderId: { shopId, shopifyOrderId: shopifyOrder.id.toString() } },
      create: {
        orgId,
        shopId,
        shopifyOrderId: shopifyOrder.id.toString(),
        orderNumber: shopifyOrder.order_number?.toString(),
        name: shopifyOrder.name,
        financialStatus: shopifyOrder.financial_status,
        fulfillmentStatus: shopifyOrder.fulfillment_status,
        totalPrice: total,
        currency: shopifyOrder.currency,
        paymentGateway: shopifyOrder.gateway,
        paymentGatewayNames: shopifyOrder.payment_gateway_names || [],
        isCod,
        confirmationStatus: isCod ? 'AWAITING_CONFIRMATION' : 'NEW',
        customerId: customer.id,
        rawPayload: shopifyOrder,
        createdAtShopify: shopifyOrder.created_at ? new Date(shopifyOrder.created_at) : undefined,
      },
      update: {
        financialStatus: shopifyOrder.financial_status,
        fulfillmentStatus: shopifyOrder.fulfillment_status,
        totalPrice: total,
        rawPayload: shopifyOrder,
      },
    });

    if (isCod && normalized) {
      const expiresAt = new Date(Date.now() + (rules.expirationMinutes || 1440) * 60 * 1000);
      const cr = await createConfirmationRequest(orgId, order.id, expiresAt);
      await sendWhatsAppForOrder(orgId, shopId, order, customer, cr);
      await sendPushToOrg(orgId, {
        title: 'New COD order awaiting confirmation',
        body: `Order ${order.name} - ${customer.name || normalized} - ${order.currency || ''}${total}`,
        data: { type: 'new_order', orderId: order.id },
      });
      return { order, confirmationRequest: cr };
    }
    return { order };
  }
}

async function sendWhatsAppForOrder(orgId: string, shopId: string, order: any, customer: any, confirmationRequest: any) {
  // load whatsapp connection
  let waConn: any;
  if (isMockMode()) {
    waConn = mockStore.whatsappConnections.find(w => w.orgId === orgId);
    if (!waConn) {
      logger.warn(`No WhatsApp connection for org ${orgId}, skipping send`);
      return;
    }
  } else {
    waConn = await prisma.whatsAppConnection.findFirst({ where: { orgId } });
    if (!waConn) {
      logger.warn(`No WhatsApp connection for org ${orgId}`);
      return;
    }
  }

  // template
  let templateName = 'order_confirm_cod';
  let language = 'en_US';
  if (!isMockMode()) {
    const tmpl = await prisma.messageTemplate.findFirst({ where: { orgId, status: 'APPROVED' } });
    if (tmpl) {
      templateName = tmpl.name;
      language = tmpl.language;
    }
  } else {
    // ensure mock template exists
    if (!mockStore.messageTemplates.find(t => t.orgId === orgId)) {
      mockStore.messageTemplates.push({
        id: uuidv4(),
        orgId,
        name: templateName,
        language,
        status: 'APPROVED',
        category: 'UTILITY',
        components: {},
        createdAt: new Date(),
      });
    }
  }

  const accessToken = waConn.accessTokenEncrypted ? decrypt(waConn.accessTokenEncrypted) : '';
  const phoneNumberId = waConn.phoneNumberId;

  // components: body with params order number, total
  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: customer.name || 'there' },
        { type: 'text', text: order.name || order.orderNumber || order.shopifyOrderId },
        { type: 'text', text: `${order.currency || '₹'}${order.totalPrice}` },
      ],
    },
    // buttons handled via quick reply if template has them
  ];

  const result = await sendWhatsAppTemplate({
    phoneNumberId,
    accessToken,
    to: customer.phoneE164,
    templateName,
    languageCode: language,
    components,
  });

  // record attempt
  if (isMockMode()) {
    mockStore.messageAttempts.push({
      id: uuidv4(),
      confirmationRequestId: confirmationRequest.id,
      templateName,
      toPhone: customer.phoneE164,
      status: result.success ? 'SENT' : 'FAILED',
      waMessageId: result.waMessageId,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      sentAt: new Date(),
      createdAt: new Date(),
    });
    if (!result.success) {
      confirmationRequest.status = 'FAILED';
    }
  } else {
    await prisma.messageAttempt.create({
      data: {
        confirmationRequestId: confirmationRequest.id,
        templateName,
        toPhone: customer.phoneE164,
        status: result.success ? 'SENT' : 'FAILED',
        waMessageId: result.waMessageId,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
    });
    if (!result.success) {
      await prisma.confirmationRequest.update({ where: { id: confirmationRequest.id }, data: { status: 'FAILED' } });
      await prisma.order.update({ where: { id: order.id }, data: { confirmationStatus: 'FAILED' } });
      await sendPushToOrg(orgId, {
        title: 'WhatsApp send failed',
        body: `Failed to send confirmation for ${order.name}: ${result.errorMessage}`,
        data: { type: 'send_failed', orderId: order.id },
      });
    }
  }
}

export async function getOrdersForOrg(orgId: string, filters: { status?: string; isCod?: boolean; search?: string; from?: string; to?: string; limit?: number; offset?: number }) {
  if (isMockMode()) {
    let orders = mockStore.orders.filter(o => o.orgId === orgId);
    if (filters.status) orders = orders.filter(o => o.confirmationStatus === filters.status);
    if (filters.isCod !== undefined) orders = orders.filter(o => o.isCod === filters.isCod);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      orders = orders.filter(o => (o.name?.toLowerCase().includes(s) || o.orderNumber?.toLowerCase().includes(s) || o.shopifyOrderId.includes(s)));
    }
    orders = orders.sort((a,b) => b.createdAt - a.createdAt);
    const total = orders.length;
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    return { orders: orders.slice(offset, offset+limit), total };
  }
  const where: any = { orgId };
  if (filters.status) where.confirmationStatus = filters.status;
  if (filters.isCod !== undefined) where.isCod = filters.isCod;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { orderNumber: { contains: filters.search, mode: 'insensitive' } },
      { shopifyOrderId: { contains: filters.search } },
    ];
  }
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(filters.from);
    if (filters.to) where.createdAt.lte = new Date(filters.to);
  }
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: filters.limit || 50, skip: filters.offset || 0, include: { customer: true, confirmationRequests: { orderBy: { createdAt: 'desc' }, take: 1 } } }),
    prisma.order.count({ where }),
  ]);
  return { orders, total };
}

export async function getOrderDetail(orgId: string, orderId: string) {
  if (isMockMode()) {
    const order = mockStore.orders.find(o => o.id === orderId && o.orgId === orgId);
    if (!order) return null;
    const customer = mockStore.customers.find(c => c.id === order.customerId);
    const crs = mockStore.confirmationRequests.filter(cr => cr.orderId === order.id).sort((a,b) => b.createdAt - a.createdAt);
    const attempts = mockStore.messageAttempts.filter(ma => crs.some(cr => cr.id === ma.confirmationRequestId));
    return { order, customer, confirmationRequests: crs, messageAttempts: attempts };
  }
  const order = await prisma.order.findFirst({ where: { id: orderId, orgId }, include: { customer: true } });
  if (!order) return null;
  const crs = await prisma.confirmationRequest.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' } });
  const attempts = await prisma.messageAttempt.findMany({ where: { confirmationRequestId: { in: crs.map((c: any) => c.id) } }, orderBy: { createdAt: 'desc' } });
  const auditLogs = await prisma.auditLog.findMany({ where: { orgId, entityType: 'order', entityId: order.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return { order, customer: order.customer, confirmationRequests: crs, messageAttempts: attempts, auditLogs };
}
