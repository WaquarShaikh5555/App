import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { buildShopifyAuthUrl, exchangeCodeForToken, registerShopifyWebhook } from '../lib/shopify';
import { encrypt } from '../lib/encryption';
import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../lib/logger';

const router = Router();

// Step 1: start OAuth - requires auth, returns URL to open in browser
router.get('/auth', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const shop = req.query.shop as string;
    if (!shop) return res.status(400).json({ error: 'Missing shop param (e.g. myshop.myshopify.com)' });
    const state = Buffer.from(JSON.stringify({ orgId: req.user!.orgId, userId: req.user!.userId, ts: Date.now() })).toString('base64');
    const url = buildShopifyAuthUrl(shop, state);
    // In mobile app, open this URL in browser
    res.json({ authUrl: url, state });
  } catch (e) {
    next(e);
  }
});

// OAuth callback - Shopify redirects here
router.get('/callback', async (req, res, next) => {
  try {
    const { code, shop, state, hmac } = req.query as any;
    if (!code || !shop) return res.status(400).send('Missing code or shop');
    // TODO: verify hmac (Shopify OAuth hmac verification)
    let orgId: string | null = null;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      orgId = decoded.orgId;
    } catch {
      // if state not parseable, try to find org by shop domain later
    }

    const tokenData = await exchangeCodeForToken(shop, code);
    const encrypted = encrypt(tokenData.access_token);

    // Save connection
    if (isMockMode()) {
      let shopRec = mockStore.shops.find(s => s.domain === shop || s.orgId === orgId);
      if (!shopRec && orgId) {
        // find first shop of org
        shopRec = mockStore.shops.find(s => s.orgId === orgId);
        if (shopRec) {
          shopRec.domain = shop;
          shopRec.name = shop;
        }
      }
      if (!shopRec) {
        // create
        const newShopId = uuidv4();
        shopRec = { id: newShopId, orgId: orgId || 'unknown', domain: shop, name: shop, createdAt: new Date() };
        mockStore.shops.push(shopRec);
      }
      const existingConn = mockStore.shopifyConnections.find(c => c.shopId === shopRec!.id);
      if (existingConn) {
        existingConn.accessTokenEncrypted = encrypted;
        existingConn.shopDomain = shop;
        existingConn.scopes = tokenData.scope.split(',');
        existingConn.status = 'connected';
        existingConn.updatedAt = new Date();
      } else {
        mockStore.shopifyConnections.push({
          id: uuidv4(),
          orgId: orgId || shopRec.orgId,
          shopId: shopRec.id,
          shopDomain: shop,
          accessTokenEncrypted: encrypted,
          scopes: tokenData.scope.split(','),
          status: 'connected',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      logger.info(`Mock Shopify connection saved for shop ${shop}`);
    } else {
      // real DB
      let shopRec = await prisma.shop.findFirst({ where: { domain: shop } });
      if (!shopRec && orgId) {
        shopRec = await prisma.shop.findFirst({ where: { orgId } });
        if (shopRec) {
          shopRec = await prisma.shop.update({ where: { id: shopRec.id }, data: { domain: shop } });
        }
      }
      if (!shopRec) {
        if (!orgId) throw new Error('Missing orgId in state and no existing shop');
        shopRec = await prisma.shop.create({ data: { orgId, domain: shop, name: shop } });
      }
      await prisma.shopifyConnection.upsert({
        where: { shopId: shopRec.id },
        create: {
          orgId: shopRec.orgId,
          shopId: shopRec.id,
          shopDomain: shop,
          accessTokenEncrypted: encrypted,
          scopes: tokenData.scope.split(','),
          status: 'connected',
        },
        update: {
          accessTokenEncrypted: encrypted,
          scopes: tokenData.scope.split(','),
          status: 'connected',
          shopDomain: shop,
        },
      });

      // Register webhook orders/create
      const webhookAddress = `${config.backendUrl}/api/webhooks/shopify/orders-create`;
      const webhookId = await registerShopifyWebhook(shop, tokenData.access_token, 'orders/create', webhookAddress);
      if (webhookId) {
        await prisma.shopifyConnection.update({ where: { shopId: shopRec.id }, data: { webhookId } });
      }
    }

    // Redirect to app deep link if possible, else show success page
    const deepLink = `orderconfirm://shopify-connected?shop=${encodeURIComponent(shop)}&status=connected`;
    const html = `
      <html><body style="font-family: sans-serif; text-align:center; padding: 40px;">
        <h2>Shopify Connected!</h2>
        <p>Shop ${shop} connected successfully.</p>
        <p><a href="${deepLink}">Open OrderConfirm app</a></p>
        <script>setTimeout(() => { window.location.href = "${deepLink}"; }, 1000);</script>
      </body></html>
    `;
    res.send(html);
  } catch (e: any) {
    logger.error(`Shopify callback error: ${e.message}`);
    res.status(500).send(`Shopify connection failed: ${e.message}`);
  }
});

// Get connection status
router.get('/status', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    if (isMockMode()) {
      const conn = mockStore.shopifyConnections.find(c => c.orgId === orgId);
      const shop = mockStore.shops.find(s => s.orgId === orgId);
      return res.json({ connected: !!conn, connection: conn ? { shopDomain: conn.shopDomain, status: conn.status, scopes: conn.scopes } : null, shop });
    }
    const conn = await prisma.shopifyConnection.findFirst({ where: { orgId } });
    const shop = await prisma.shop.findFirst({ where: { orgId } });
    res.json({ connected: !!conn && conn.status === 'connected', connection: conn, shop });
  } catch (e) {
    next(e);
  }
});

router.post('/disconnect', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    if (isMockMode()) {
      const idx = mockStore.shopifyConnections.findIndex(c => c.orgId === orgId);
      if (idx >= 0) {
        mockStore.shopifyConnections[idx].status = 'disconnected';
      }
      return res.json({ disconnected: true });
    }
    await prisma.shopifyConnection.updateMany({ where: { orgId }, data: { status: 'disconnected' } });
    res.json({ disconnected: true });
  } catch (e) {
    next(e);
  }
});

export default router;
