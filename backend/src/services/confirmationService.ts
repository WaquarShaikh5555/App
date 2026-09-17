import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { logger } from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';

export type ConfirmationStatus = 'NEW' | 'AWAITING_CONFIRMATION' | 'CONFIRMED' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';

const validTransitions: Record<ConfirmationStatus, ConfirmationStatus[]> = {
  NEW: ['AWAITING_CONFIRMATION', 'FAILED'],
  AWAITING_CONFIRMATION: ['CONFIRMED', 'CANCEL_REQUESTED', 'EXPIRED', 'FAILED'],
  CONFIRMED: [],
  CANCEL_REQUESTED: ['CANCELLED', 'CONFIRMED'], // merchant can still confirm after cancel request if policy requires approval
  CANCELLED: [],
  EXPIRED: [],
  FAILED: ['AWAITING_CONFIRMATION'], // retry
};

export function canTransition(from: ConfirmationStatus, to: ConfirmationStatus): boolean {
  return validTransitions[from]?.includes(to) || false;
}

export async function transitionConfirmationRequest(orgId: string, confirmationRequestId: string, to: ConfirmationStatus, actor: { type: string; id?: string }, metadata?: any) {
  if (isMockMode()) {
    const cr = mockStore.confirmationRequests.find(c => c.id === confirmationRequestId && c.orgId === orgId);
    if (!cr) throw new Error('Confirmation request not found');
    if (!canTransition(cr.status as ConfirmationStatus, to)) {
      throw new Error(`Invalid transition ${cr.status} -> ${to}`);
    }
    cr.status = to;
    cr.updatedAt = new Date();
    if (to === 'CONFIRMED') cr.confirmedAt = new Date();
    if (to === 'CANCELLED' || to === 'CANCEL_REQUESTED') cr.cancelledAt = new Date();
    // audit
    mockStore.auditLogs.push({
      id: uuidv4(),
      orgId,
      actorType: actor.type,
      actorId: actor.id,
      action: 'STATE_TRANSITION',
      entityType: 'confirmation_request',
      entityId: cr.id,
      metadata: { from: cr.status, to, ...metadata },
      createdAt: new Date(),
    });
    // also update order
    const order = mockStore.orders.find(o => o.id === cr.orderId);
    if (order) {
      order.confirmationStatus = to;
      order.updatedAt = new Date();
    }
    return cr;
  }

  const cr = await prisma.confirmationRequest.findFirst({ where: { id: confirmationRequestId, orgId } });
  if (!cr) throw new Error('Confirmation request not found');
  if (!canTransition(cr.status as ConfirmationStatus, to)) {
    throw new Error(`Invalid transition ${cr.status} -> ${to}`);
  }
  const updated = await prisma.confirmationRequest.update({
    where: { id: cr.id },
    data: {
      status: to,
      confirmedAt: to === 'CONFIRMED' ? new Date() : undefined,
      cancelledAt: to === 'CANCELLED' || to === 'CANCEL_REQUESTED' ? new Date() : undefined,
    },
  });
  await prisma.order.update({
    where: { id: cr.orderId },
    data: { confirmationStatus: to },
  });
  await prisma.auditLog.create({
    data: {
      orgId,
      actorType: actor.type,
      actorId: actor.id,
      action: 'STATE_TRANSITION',
      entityType: 'confirmation_request',
      entityId: cr.id,
      metadata: { from: cr.status, to, ...metadata },
    },
  });
  return updated;
}

export async function createConfirmationRequest(orgId: string, orderId: string, expiresAt?: Date) {
  if (isMockMode()) {
    const id = uuidv4();
    const cr = {
      id,
      orderId,
      orgId,
      status: 'AWAITING_CONFIRMATION' as ConfirmationStatus,
      expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      reminderCount: 0,
    };
    mockStore.confirmationRequests.push(cr);
    return cr;
  }
  return prisma.confirmationRequest.create({
    data: {
      orgId,
      orderId,
      status: 'AWAITING_CONFIRMATION',
      expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}
