import { Router } from 'express';
import axios from 'axios';
import { z, ZodError } from 'zod';
import { registerUser, loginUser, refreshTokens, loginOrRegisterWithGoogle } from '../services/authService';
import { config } from '../config';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma, isMockMode, mockStore } from '../lib/prisma';

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
    if (e instanceof ZodError) return next(e);
    if (typeof e?.message === 'string' && e.message.toLowerCase().includes('exists')) {
      return res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.' });
    }
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
    if (e instanceof ZodError) return next(e);
    res.status(401).json({ error: 'Email or password is incorrect.' });
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
    if (e instanceof ZodError) return next(e);
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
});

/**
 * Google sign-in.
 *
 * The ID token is verified with Google itself (tokeninfo), which checks the signature,
 * issuer and expiry server-side. We then check the audience ourselves, so a token minted
 * for a different application cannot be replayed here.
 */
const googleSchema = z.object({ idToken: z.string().min(20) });

router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = googleSchema.parse(req.body);

    if (config.google.clientIds.length === 0) {
      return res.status(501).json({ error: 'Google sign-in is not configured on the server (set GOOGLE_CLIENT_ID).' });
    }

    let profile: any;
    try {
      const { data } = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
        params: { id_token: idToken },
        timeout: 10000,
      });
      profile = data;
    } catch (e: any) {
      const detail = e?.response?.data?.error_description || 'Google rejected the token';
      return res.status(401).json({ error: `Google sign-in failed: ${detail}` });
    }

    if (!config.google.clientIds.includes(profile.aud)) {
      return res.status(401).json({ error: 'Google sign-in failed: the token was issued for a different app.' });
    }
    if (!profile.email || profile.email_verified === 'false') {
      return res.status(401).json({ error: 'Google sign-in failed: the Google account has no verified email.' });
    }

    const result = await loginOrRegisterWithGoogle(profile.email, profile.name || undefined);
    res.json(result);
  } catch (e: any) {
    if (e instanceof ZodError) return next(e);
    res.status(400).json({ error: 'Google sign-in failed. Please try again.' });
  }
});

/** Current account, resolved from the access token. */
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId, orgId } = req.user!;
    if (isMockMode()) {
      const user = mockStore.users.find((u) => u.id === userId);
      const org = mockStore.orgs.find((o) => o.id === orgId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { passwordHash, ...safeUser } = user;
      return res.json({ user: safeUser, org });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { passwordHash, ...safeUser } = user;
    res.json({ user: safeUser, org });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
