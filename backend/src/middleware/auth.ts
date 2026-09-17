import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma, isMockMode, mockStore } from '../lib/prisma';

export interface AuthPayload {
  userId: string;
  orgId: string;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  const token = header.substring(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function loadOrgMembership(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  // Verify membership exists
  if (isMockMode()) {
    const membership = mockStore.memberships.find(m => m.userId === req.user!.userId && m.orgId === req.user!.orgId);
    if (!membership) return res.status(403).json({ error: 'No membership' });
    return next();
  }
  if (!prisma) return next();
  const membership = await prisma.membership.findFirst({
    where: { userId: req.user.userId, orgId: req.user.orgId },
  });
  if (!membership) return res.status(403).json({ error: 'Forbidden: no org membership' });
  next();
}
