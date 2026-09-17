import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    let settings: any;
    if (isMockMode()) {
      settings = mockStore.notificationSettings.find(s => s.orgId === orgId);
    } else {
      settings = await prisma.notificationSetting.findUnique({ where: { orgId } });
    }
    res.json(settings || { enablePush: true, rules: {} });
  } catch (e) {
    next(e);
  }
});

const settingsSchema = z.object({
  enablePush: z.boolean().optional(),
  rules: z.object({
    minCodValue: z.number().min(0).optional(),
    maxCodValue: z.number().min(0).optional(),
    ignorePrepaid: z.boolean().optional(),
    sendDelaySeconds: z.number().min(0).max(3600).optional(),
    reminderCount: z.number().min(0).max(5).optional(),
    reminderIntervalMinutes: z.number().min(1).max(1440).optional(),
    expirationMinutes: z.number().min(5).max(10080).optional(),
    requireCancellationApproval: z.boolean().optional(),
  }).optional(),
});

router.put('/', async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    const parsed = settingsSchema.parse(req.body);
    if (isMockMode()) {
      let settings = mockStore.notificationSettings.find(s => s.orgId === orgId);
      if (!settings) {
        settings = { id: uuidv4(), orgId, enablePush: true, rules: {}, createdAt: new Date(), updatedAt: new Date() };
        mockStore.notificationSettings.push(settings);
      }
      if (parsed.enablePush !== undefined) settings.enablePush = parsed.enablePush;
      if (parsed.rules) {
        settings.rules = { ...settings.rules, ...parsed.rules };
      }
      settings.updatedAt = new Date();
      return res.json(settings);
    }
    const updated = await prisma.notificationSetting.upsert({
      where: { orgId },
      create: { orgId, enablePush: parsed.enablePush ?? true, rules: parsed.rules as any },
      update: { enablePush: parsed.enablePush, rules: parsed.rules as any },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;
