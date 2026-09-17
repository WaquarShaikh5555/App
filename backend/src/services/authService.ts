import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { v4 as uuidv4 } from 'uuid';

export async function registerUser(email: string, password: string, name?: string, orgName?: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  if (isMockMode()) {
    if (mockStore.users.find(u => u.email === email)) throw new Error('Email already exists');
    const userId = uuidv4();
    const orgId = uuidv4();
    const user = { id: userId, email, passwordHash, name, createdAt: new Date() };
    const org = { id: orgId, name: orgName || `${name || email}'s Store`, createdAt: new Date() };
    const membership = { id: uuidv4(), userId, orgId, role: 'owner', createdAt: new Date() };
    const shopId = uuidv4();
    const shop = { id: shopId, orgId, domain: null, name: org.name, createdAt: new Date() };
    const notif = { id: uuidv4(), orgId, enablePush: true, rules: { minCodValue: 0, maxCodValue: 100000, ignorePrepaid: true, sendDelaySeconds: 0, reminderCount: 2, reminderIntervalMinutes: 60, expirationMinutes: 1440, requireCancellationApproval: false } };
    mockStore.users.push(user);
    mockStore.orgs.push(org);
    mockStore.memberships.push(membership);
    mockStore.shops.push(shop);
    mockStore.notificationSettings.push(notif);
    return { user, org, membership, shop };
  }
  // real DB
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('Email already exists');
  const org = await prisma.organization.create({ data: { name: orgName || `${name || email}'s Store` } });
  const user = await prisma.user.create({ data: { email, passwordHash, name } });
  const membership = await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: 'owner' } });
  const shop = await prisma.shop.create({ data: { orgId: org.id, name: org.name } });
  await prisma.notificationSetting.create({
    data: {
      orgId: org.id,
      enablePush: true,
      rules: {
        minCodValue: 0,
        maxCodValue: 100000,
        ignorePrepaid: true,
        sendDelaySeconds: 0,
        reminderCount: 2,
        reminderIntervalMinutes: 60,
        expirationMinutes: 1440,
        requireCancellationApproval: false,
      } as any,
    },
  });
  return { user, org, membership, shop };
}

export async function loginUser(email: string, password: string) {
  let user: any;
  let membership: any;
  let org: any;
  if (isMockMode()) {
    user = mockStore.users.find(u => u.email === email);
    if (!user) throw new Error('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');
    membership = mockStore.memberships.find(m => m.userId === user.id);
    org = mockStore.orgs.find(o => o.id === membership?.orgId);
  } else {
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');
    membership = await prisma.membership.findFirst({ where: { userId: user.id } });
    if (!membership) throw new Error('No organization');
    org = await prisma.organization.findUnique({ where: { id: membership.orgId } });
  }
  if (!membership || !org) throw new Error('No org membership');

  const payload = { userId: user.id, orgId: org.id, email: user.email, role: membership.role };
  const accessToken = jwt.sign(payload, config.jwtSecret, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: '30d' });

  return { user, org, membership, accessToken, refreshToken };
}

export async function refreshTokens(refreshToken: string) {
  try {
    const payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as any;
    // verify user still exists and membership
    let user: any, membership: any;
    if (isMockMode()) {
      user = mockStore.users.find(u => u.id === payload.userId);
      membership = mockStore.memberships.find(m => m.userId === payload.userId && m.orgId === payload.orgId);
    } else {
      user = await prisma.user.findUnique({ where: { id: payload.userId } });
      membership = await prisma.membership.findFirst({ where: { userId: payload.userId, orgId: payload.orgId } });
    }
    if (!user || !membership) throw new Error('Invalid refresh');
    const newPayload = { userId: user.id, orgId: membership.orgId, email: user.email, role: membership.role };
    const accessToken = jwt.sign(newPayload, config.jwtSecret, { expiresIn: '15m' });
    const newRefreshToken = jwt.sign(newPayload, config.jwtRefreshSecret, { expiresIn: '30d' });
    return { accessToken, refreshToken: newRefreshToken, user, orgId: membership.orgId };
  } catch (e) {
    throw new Error('Invalid refresh token');
  }
}
