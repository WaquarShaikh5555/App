import { prisma, isMockMode, mockStore } from '../lib/prisma';
import { transitionConfirmationRequest } from '../services/confirmationService';
import { logger } from '../lib/logger';
import { sendPushToOrg } from '../services/pushService';

export async function runExpirationJob() {
  logger.info('Running expiration job');
  const now = new Date();
  if (isMockMode()) {
    const expired = mockStore.confirmationRequests.filter(c => c.status === 'AWAITING_CONFIRMATION' && c.expiresAt && c.expiresAt < now);
    for (const cr of expired) {
      try {
        await transitionConfirmationRequest(cr.orgId, cr.id, 'EXPIRED', { type: 'system' });
        await sendPushToOrg(cr.orgId, { title: 'Order confirmation expired', body: `Confirmation expired for order ${cr.orderId}`, data: { type: 'expired', orderId: cr.orderId } });
      } catch (e: any) {
        logger.error(`Expiration failed for ${cr.id}: ${e.message}`);
      }
    }
    return;
  }
  const toExpire = await prisma.confirmationRequest.findMany({
    where: { status: 'AWAITING_CONFIRMATION', expiresAt: { lt: now } },
  });
  for (const cr of toExpire) {
    try {
      await transitionConfirmationRequest(cr.orgId, cr.id, 'EXPIRED', { type: 'system' });
      await sendPushToOrg(cr.orgId, { title: 'Order confirmation expired', body: `Confirmation expired`, data: { type: 'expired', orderId: cr.orderId } });
    } catch (e: any) {
      logger.error(`Expiration failed for ${cr.id}: ${e.message}`);
    }
  }
}

export function startJobs() {
  // Run every 5 minutes
  setInterval(runExpirationJob, 5 * 60 * 1000);
  // initial
  setTimeout(runExpirationJob, 10 * 1000);
}
