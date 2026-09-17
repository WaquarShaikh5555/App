import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { encrypt, decrypt } from '../lib/encryption';
import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { fetchWhatsAppTemplates, exchangeWhatsAppCode, sendWhatsAppTemplate } from '../lib/whatsapp';
import { logger } from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Start WhatsApp connection - returns URL for Embedded Signup
router.get('/auth/start', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    // In production, you would generate a Embedded Signup URL
    // For MVP, we simulate with a page that explains and allows manual token entry
    const state = Buffer.from(JSON.stringify({ orgId, userId: req.user!.userId })).toString('base64');
    const redirectUri = `${config.backendUrl}/api/whatsapp/callback`;
    // Meta Embedded Signup v4 URL pattern
    // https://www.facebook.com/v26.0/dialog/oauth?client_id=APP_ID&redirect_uri=REDIRECT&scope=whatsapp_business_management,whatsapp_business_messaging&state=STATE&response_type=code
    const authUrl = config.mockMode
      ? `${config.backendUrl}/api/whatsapp/mock-connect?state=${state}`
      : `https://www.facebook.com/${config.whatsapp.apiVersion}/dialog/oauth?client_id=${config.whatsapp.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=whatsapp_business_management,whatsapp_business_messaging&state=${state}&response_type=code`;

    res.json({ authUrl, state, mockMode: config.mockMode });
  } catch (e) {
    next(e);
  }
});

// OAuth callback from Meta
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query as any;
    if (!code) return res.status(400).send('Missing code');
    let orgId: string | null = null;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      orgId = decoded.orgId;
    } catch {}
    if (!orgId) return res.status(400).send('Invalid state');

    const tokenData = await exchangeWhatsAppCode(code);
    const encrypted = encrypt(tokenData.access_token);

    // Fetch templates to check approval
    let templates: any[] = [];
    try {
      if (tokenData.waba_id) {
        templates = await fetchWhatsAppTemplates(tokenData.waba_id, tokenData.access_token);
      }
    } catch (e) {
      logger.warn(`Failed to fetch templates: ${e}`);
    }
    const hasApproved = templates.some(t => t.status === 'APPROVED');

    if (isMockMode()) {
      const existing = mockStore.whatsappConnections.find(w => w.orgId === orgId);
      if (existing) {
        existing.accessTokenEncrypted = encrypted;
        existing.wabaId = tokenData.waba_id || existing.wabaId;
        existing.phoneNumberId = tokenData.phone_number_id || existing.phoneNumberId;
        existing.status = 'connected';
        existing.templateStatus = hasApproved ? 'approved' : 'pending';
        existing.updatedAt = new Date();
      } else {
        mockStore.whatsappConnections.push({
          id: uuidv4(),
          orgId,
          shopId: null,
          wabaId: tokenData.waba_id || `mock_waba_${Date.now()}`,
          phoneNumberId: tokenData.phone_number_id || `mock_phone_${Date.now()}`,
          displayPhoneNumber: '+91XXXXXXXXXX',
          accessTokenEncrypted: encrypted,
          status: 'connected',
          templateStatus: hasApproved ? 'approved' : 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      // store mock template
      if (templates.length) {
        for (const t of templates) {
          if (!mockStore.messageTemplates.find(mt => mt.orgId === orgId && mt.name === t.name)) {
            mockStore.messageTemplates.push({
              id: uuidv4(),
              orgId,
              wabaId: t.waba_id || tokenData.waba_id,
              name: t.name,
              language: t.language || 'en_US',
              status: t.status,
              category: t.category || 'UTILITY',
              components: t.components,
              createdAt: new Date(),
            });
          }
        }
      }
    } else {
      const shop = await prisma.shop.findFirst({ where: { orgId } });
      await prisma.whatsAppConnection.upsert({
        where: { orgId },
        create: {
          orgId,
          shopId: shop?.id,
          wabaId: tokenData.waba_id,
          phoneNumberId: tokenData.phone_number_id,
          accessTokenEncrypted: encrypted,
          status: 'connected',
          templateStatus: hasApproved ? 'approved' : 'pending',
        },
        update: {
          wabaId: tokenData.waba_id,
          phoneNumberId: tokenData.phone_number_id,
          accessTokenEncrypted: encrypted,
          status: 'connected',
          templateStatus: hasApproved ? 'approved' : 'pending',
        },
      } as any);
      // store templates
      for (const t of templates) {
        await prisma.messageTemplate.upsert({
          where: { orgId_name_language: { orgId, name: t.name, language: t.language || 'en_US' } },
          create: {
            orgId,
            wabaId: tokenData.waba_id,
            name: t.name,
            language: t.language || 'en_US',
            status: t.status,
            category: t.category || 'UTILITY',
            components: t.components,
            metaTemplateId: t.id,
          },
          update: {
            status: t.status,
            components: t.components,
            metaTemplateId: t.id,
          },
        });
      }
    }

    const deepLink = `orderconfirm://whatsapp-connected?status=connected`;
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;">
        <h2>WhatsApp Connected!</h2>
        <p>WABA connected, template status: ${hasApproved ? 'approved' : 'pending'}</p>
        <p><a href="${deepLink}">Open OrderConfirm app</a></p>
        <script>setTimeout(()=>{ window.location.href="${deepLink}"; },1000);</script>
      </body></html>
    `);
  } catch (e: any) {
    logger.error(`WhatsApp callback error: ${e.message}`);
    res.status(500).send(`WhatsApp connection failed: ${e.message}`);
  }
});

// Mock connect page for local dev without Meta credentials
router.get('/mock-connect', async (req, res) => {
  const state = req.query.state as string;
  const html = `
    <html><body style="font-family:sans-serif;padding:40px;max-width:600px;margin:auto;">
      <h2>Mock WhatsApp Connect (Dev Mode)</h2>
      <p>This is a mock connection for local development. No real Meta credentials needed.</p>
      <p>Click below to simulate successful WhatsApp Business connection with an approved template.</p>
      <form method="POST" action="/api/whatsapp/mock-connect">
        <input type="hidden" name="state" value="${state}" />
        <label>WABA ID: <input name="wabaId" value="mock_waba_123" /></label><br/><br/>
        <label>Phone Number ID: <input name="phoneNumberId" value="mock_phone_123" /></label><br/><br/>
        <label>Display Phone: <input name="displayPhone" value="+919876543210" /></label><br/><br/>
        <button type="submit" style="padding:10px 20px;background:#25D366;color:white;border:none;border-radius:5px;cursor:pointer;">Connect Mock WhatsApp</button>
      </form>
    </body></html>
  `;
  res.send(html);
});

router.post('/mock-connect', async (req, res) => {
  // need body parser, but we can handle urlencoded
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    const params = new URLSearchParams(body);
    const state = params.get('state') || '';
    const wabaId = params.get('wabaId') || `mock_waba_${Date.now()}`;
    const phoneNumberId = params.get('phoneNumberId') || `mock_phone_${Date.now()}`;
    const displayPhone = params.get('displayPhone') || '+919876543210';
    let orgId: string | null = null;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      orgId = decoded.orgId;
    } catch {}
    if (!orgId) {
      return res.status(400).send('Invalid state');
    }
    const fakeToken = `mock_wa_token_${Date.now()}`;
    const encrypted = encrypt(fakeToken);
    if (isMockMode()) {
      const existing = mockStore.whatsappConnections.find(w => w.orgId === orgId);
      if (existing) {
        existing.wabaId = wabaId;
        existing.phoneNumberId = phoneNumberId;
        existing.displayPhoneNumber = displayPhone;
        existing.accessTokenEncrypted = encrypted;
        existing.status = 'connected';
        existing.templateStatus = 'approved';
        existing.updatedAt = new Date();
      } else {
        mockStore.whatsappConnections.push({
          id: uuidv4(),
          orgId,
          shopId: null,
          wabaId,
          phoneNumberId,
          displayPhoneNumber: displayPhone,
          accessTokenEncrypted: encrypted,
          status: 'connected',
          templateStatus: 'approved',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      if (!mockStore.messageTemplates.find(t => t.orgId === orgId && t.name === 'order_confirm_cod')) {
        mockStore.messageTemplates.push({
          id: uuidv4(),
          orgId,
          wabaId,
          name: 'order_confirm_cod',
          language: 'en_US',
          status: 'APPROVED',
          category: 'UTILITY',
          components: { body: 'Hi {{1}}, please confirm your COD order {{2}} worth {{3}}' },
          createdAt: new Date(),
        });
      }
    } else {
      const shop = await prisma.shop.findFirst({ where: { orgId } });
      await prisma.whatsAppConnection.upsert({
        where: { orgId },
        create: { orgId, shopId: shop?.id, wabaId, phoneNumberId, displayPhoneNumber: displayPhone, accessTokenEncrypted: encrypted, status: 'connected', templateStatus: 'approved' },
        update: { wabaId, phoneNumberId, displayPhoneNumber: displayPhone, accessTokenEncrypted: encrypted, status: 'connected', templateStatus: 'approved' },
      } as any);
    }
    const deepLink = `orderconfirm://whatsapp-connected?status=connected`;
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>Mock WhatsApp Connected!</h2><p><a href="${deepLink}">Open app</a></p><script>setTimeout(()=>{window.location.href="${deepLink}"},1000);</script></body></html>`);
  });
});

// Manual connection via token (for testing)
router.post('/connect-manual', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      wabaId: z.string(),
      phoneNumberId: z.string(),
      accessToken: z.string(),
      displayPhoneNumber: z.string().optional(),
    });
    const { wabaId, phoneNumberId, accessToken, displayPhoneNumber } = schema.parse(req.body);
    const orgId = req.user!.orgId;
    const encrypted = encrypt(accessToken);

    // fetch templates to verify
    let templates: any[] = [];
    try {
      templates = await fetchWhatsAppTemplates(wabaId, accessToken);
    } catch {}

    const hasApproved = templates.some(t => t.status === 'APPROVED');

    if (isMockMode()) {
      const existing = mockStore.whatsappConnections.find(w => w.orgId === orgId);
      if (existing) {
        existing.wabaId = wabaId;
        existing.phoneNumberId = phoneNumberId;
        existing.displayPhoneNumber = displayPhoneNumber || existing.displayPhoneNumber;
        existing.accessTokenEncrypted = encrypted;
        existing.status = 'connected';
        existing.templateStatus = hasApproved ? 'approved' : 'pending';
        existing.updatedAt = new Date();
      } else {
        mockStore.whatsappConnections.push({
          id: uuidv4(),
          orgId,
          shopId: null,
          wabaId,
          phoneNumberId,
          displayPhoneNumber: displayPhoneNumber || '+91XXXXXXXXXX',
          accessTokenEncrypted: encrypted,
          status: 'connected',
          templateStatus: hasApproved ? 'approved' : 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } else {
      const shop = await prisma.shop.findFirst({ where: { orgId } });
      await prisma.whatsAppConnection.upsert({
        where: { orgId },
        create: { orgId, shopId: shop?.id, wabaId, phoneNumberId, displayPhoneNumber, accessTokenEncrypted: encrypted, status: 'connected', templateStatus: hasApproved ? 'approved' : 'pending' },
        update: { wabaId, phoneNumberId, displayPhoneNumber, accessTokenEncrypted: encrypted, status: 'connected', templateStatus: hasApproved ? 'approved' : 'pending' },
      } as any);
    }

    res.json({ connected: true, templateStatus: hasApproved ? 'approved' : 'pending', templatesCount: templates.length });
  } catch (e) {
    next(e);
  }
});

router.get('/status', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    let conn: any;
    let templates: any[] = [];
    if (isMockMode()) {
      conn = mockStore.whatsappConnections.find(w => w.orgId === orgId);
      templates = mockStore.messageTemplates.filter(t => t.orgId === orgId);
    } else {
      conn = await prisma.whatsAppConnection.findFirst({ where: { orgId } });
      templates = await prisma.messageTemplate.findMany({ where: { orgId } });
    }
    if (!conn) return res.json({ connected: false });
    // Never return decrypted token
    res.json({
      connected: conn.status === 'connected',
      status: conn.status,
      templateStatus: conn.templateStatus,
      wabaId: conn.wabaId,
      phoneNumberId: conn.phoneNumberId,
      displayPhoneNumber: conn.displayPhoneNumber,
      templates,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/disconnect', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    if (isMockMode()) {
      const conn = mockStore.whatsappConnections.find(w => w.orgId === orgId);
      if (conn) conn.status = 'disconnected';
      return res.json({ disconnected: true });
    }
    await prisma.whatsAppConnection.updateMany({ where: { orgId }, data: { status: 'disconnected' } });
    res.json({ disconnected: true });
  } catch (e) {
    next(e);
  }
});

router.post('/test-message', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({ to: z.string(), templateName: z.string().optional() });
    const { to, templateName } = schema.parse(req.body);
    const orgId = req.user!.orgId;
    let conn: any;
    if (isMockMode()) {
      conn = mockStore.whatsappConnections.find(w => w.orgId === orgId);
    } else {
      conn = await prisma.whatsAppConnection.findFirst({ where: { orgId } });
    }
    if (!conn || conn.status !== 'connected') return res.status(400).json({ error: 'WhatsApp not connected' });
    const accessToken = decrypt(conn.accessTokenEncrypted);
    const result = await sendWhatsAppTemplate({
      phoneNumberId: conn.phoneNumberId,
      accessToken,
      to,
      templateName: templateName || 'order_confirm_cod',
      languageCode: 'en_US',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Test User' }, { type: 'text', text: '#1001' }, { type: 'text', text: '₹999' }] }],
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
