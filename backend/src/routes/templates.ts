import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { fetchWhatsAppTemplates } from '../lib/whatsapp';
import { decrypt } from '../lib/encryption';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    let templates: any[] = [];
    let liveTemplates: any[] = [];
    if (isMockMode()) {
      templates = mockStore.messageTemplates.filter(t => t.orgId === orgId);
    } else {
      templates = await prisma.messageTemplate.findMany({ where: { orgId } });
      // try to fetch live from Meta if connection exists
      const conn = await prisma.whatsAppConnection.findFirst({ where: { orgId } });
      if (conn && conn.wabaId && conn.accessTokenEncrypted) {
        try {
          const token = decrypt(conn.accessTokenEncrypted);
          liveTemplates = await fetchWhatsAppTemplates(conn.wabaId, token);
        } catch {}
      }
    }
    res.json({ templates, liveTemplates, note: 'Only templates with status APPROVED can be sent. Meta approval can take time.' });
  } catch (e) {
    next(e);
  }
});

export default router;
