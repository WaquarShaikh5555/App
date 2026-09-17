import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { registerPushToken } from '../services/pushService';
import { isValidExpoPushToken } from '../lib/push';

const router = Router();
router.use(authMiddleware);

const schema = z.object({
  expoPushToken: z.string(),
  platform: z.string().optional(),
});

router.post('/register', async (req: AuthRequest, res, next) => {
  try {
    const { expoPushToken, platform } = schema.parse(req.body);
    if (!isValidExpoPushToken(expoPushToken)) {
      return res.status(400).json({ error: 'Invalid Expo push token' });
    }
    const token = await registerPushToken(req.user!.userId, req.user!.orgId, expoPushToken, platform);
    res.json({ registered: true, token });
  } catch (e) {
    next(e);
  }
});

export default router;
