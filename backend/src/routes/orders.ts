import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getOrdersForOrg, getOrderDetail } from '../services/orderService';
import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { transitionConfirmationRequest } from '../services/confirmationService';
import { maskPhone } from '../lib/encryption';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    const { status, isCod, search, from, to, limit, offset } = req.query as any;
    const result = await getOrdersForOrg(orgId, {
      status: status as string,
      isCod: isCod !== undefined ? isCod === 'true' : undefined,
      search: search as string,
      from: from as string,
      to: to as string,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    const orderId = req.params.id;
    const detail = await getOrderDetail(orgId, orderId);
    if (!detail) return res.status(404).json({ error: 'Order not found' });
    // mask phone by default
    if (detail.customer?.phoneE164) {
      detail.customer.phoneMasked = maskPhone(detail.customer.phoneE164);
      // don't expose full phone unless explicitly revealed
      const showFull = req.query.reveal === 'true';
      if (!showFull) {
        // hide full
        detail.customer.phoneE164 = undefined;
      }
    }
    res.json(detail);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/reveal-phone', async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    const orderId = req.params.id;
    const detail = await getOrderDetail(orgId, orderId);
    if (!detail) return res.status(404).json({ error: 'Order not found' });

    // audit log
    const actorId = req.user!.userId;
    if (isMockMode()) {
      mockStore.auditLogs.push({
        id: uuidv4(),
        orgId,
        actorType: 'user',
        actorId,
        action: 'PHONE_REVEAL',
        entityType: 'customer',
        entityId: detail.customer?.id,
        metadata: { orderId },
        createdAt: new Date(),
      });
    } else {
      await prisma.auditLog.create({
        data: {
          orgId,
          actorType: 'user',
          actorId,
          action: 'PHONE_REVEAL',
          entityType: 'customer',
          entityId: detail.customer?.id,
          metadata: { orderId },
        },
      });
    }

    res.json({ phone: (detail.customer as any)?.phoneE164 || detail.order?.customer?.phoneE164 || null, masked: detail.customer?.phoneMasked });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/confirm', async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    const orderId = req.params.id;
    // find latest confirmation request
    let cr: any;
    if (isMockMode()) {
      cr = mockStore.confirmationRequests.filter(c => c.orderId === orderId && c.orgId === orgId).sort((a,b) => b.createdAt - a.createdAt)[0];
    } else {
      cr = await prisma.confirmationRequest.findFirst({ where: { orderId, orgId }, orderBy: { createdAt: 'desc' } });
    }
    if (!cr) return res.status(404).json({ error: 'No confirmation request' });
    const updated = await transitionConfirmationRequest(orgId, cr.id, 'CONFIRMED', { type: 'user', id: req.user!.userId });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/cancel', async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    const orderId = req.params.id;
    let cr: any;
    if (isMockMode()) {
      cr = mockStore.confirmationRequests.filter(c => c.orderId === orderId && c.orgId === orgId).sort((a,b) => b.createdAt - a.createdAt)[0];
    } else {
      cr = await prisma.confirmationRequest.findFirst({ where: { orderId, orgId }, orderBy: { createdAt: 'desc' } });
    }
    if (!cr) return res.status(404).json({ error: 'No confirmation request' });
    // first to CANCEL_REQUESTED then CANCELLED if allowed
    let updated = await transitionConfirmationRequest(orgId, cr.id, 'CANCEL_REQUESTED', { type: 'user', id: req.user!.userId });
    // auto to CANCELLED
    try {
      updated = await transitionConfirmationRequest(orgId, cr.id, 'CANCELLED', { type: 'user', id: req.user!.userId });
    } catch {}
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/resend', async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    const orderId = req.params.id;
    // resend logic: find order and customer, send whatsapp again
    const detail = await getOrderDetail(orgId, orderId);
    if (!detail) return res.status(404).json({ error: 'Order not found' });
    if (!detail.customer?.phoneE164 && !(detail.customer as any)?.phoneE164) {
      // try mock store full phone
      if (isMockMode()) {
        const cust = mockStore.customers.find(c => c.id === detail.order.customerId);
        if (!cust?.phoneE164) return res.status(400).json({ error: 'No phone' });
      } else {
        return res.status(400).json({ error: 'No phone' });
      }
    }
    // For MVP, just return success (actual send happens via service)
    res.json({ message: 'Resend queued', note: 'In production this would resend WhatsApp template. Use /api/whatsapp/test-message for manual test.' });
  } catch (e) {
    next(e);
  }
});

export default router;
