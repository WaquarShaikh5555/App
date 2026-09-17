import { Router } from 'express';
import { z } from 'zod';
import { registerUser, loginUser, refreshTokens } from '../services/authService';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  orgName: z.string().optional(),
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, orgName } = registerSchema.parse(req.body);
    const result = await registerUser(email, password, name, orgName);
    // auto login
    const login = await loginUser(email, password);
    res.json({ user: login.user, org: login.org, accessToken: login.accessToken, refreshToken: login.refreshToken });
  } catch (e: any) {
    if (e.message.includes('exists')) return res.status(409).json({ error: e.message });
    next(e);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await loginUser(email, password);
    res.json(result);
  } catch (e: any) {
    res.status(401).json({ error: e.message });
  }
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await refreshTokens(refreshToken);
    res.json(result);
  } catch (e: any) {
    res.status(401).json({ error: e.message });
  }
});

router.get('/me', async (req, res) => {
  res.json({ message: 'Use /api/auth/login' });
});

export default router;
