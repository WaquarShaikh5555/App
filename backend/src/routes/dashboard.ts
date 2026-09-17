import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma, isMockMode, mockStore } from '../lib/prisma';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user!.orgId;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let orders: any[] = [];
    let confirmationRequests: any[] = [];
    let messageAttempts: any[] = [];

    if (isMockMode()) {
      orders = mockStore.orders.filter(o => o.orgId === orgId);
      confirmationRequests = mockStore.confirmationRequests.filter(c => c.orgId === orgId);
      messageAttempts = mockStore.messageAttempts;
    } else {
      orders = await prisma.order.findMany({ where: { orgId } });
      confirmationRequests = await prisma.confirmationRequest.findMany({ where: { orgId } });
      messageAttempts = await prisma.messageAttempt.findMany({ where: { confirmationRequest: { orgId } } });
    }

    const todayOrders = orders.filter(o => o.createdAt >= startOfDay);
    const codOrders = orders.filter(o => o.isCod);
    const todayCod = todayOrders.filter(o => o.isCod);

    const awaiting = orders.filter(o => o.confirmationStatus === 'AWAITING_CONFIRMATION').length;
    const confirmed = orders.filter(o => o.confirmationStatus === 'CONFIRMED').length;
    const cancelled = orders.filter(o => o.confirmationStatus === 'CANCELLED' || o.confirmationStatus === 'CANCEL_REQUESTED').length;
    const expired = orders.filter(o => o.confirmationStatus === 'EXPIRED').length;
    const failed = orders.filter(o => o.confirmationStatus === 'FAILED').length;

    const totalCod = codOrders.length || 1;
    const confirmationRate = totalCod ? (confirmed / totalCod) * 100 : 0;
    const cancellationRate = totalCod ? (cancelled / totalCod) * 100 : 0;
    const noResponseRate = totalCod ? ((awaiting + expired) / totalCod) * 100 : 0;

    const totalSent = messageAttempts.length;
    const delivered = messageAttempts.filter(m => ['DELIVERED','READ','SENT'].includes(m.status)).length;
    const deliveryRate = totalSent ? (delivered / totalSent) * 100 : 0;

    // Estimated RTO reduction: if merchant's historical RTO was e.g. 30%, and we cancelled X orders that would have RTO'd, we can estimate.
    // For MVP, we don't claim causation, just show counts.
    // Let merchant compare: show cancelled COD count as potential RTO prevented.

    res.json({
      today: {
        orders: todayOrders.length,
        codOrders: todayCod.length,
        awaiting: todayOrders.filter(o => o.confirmationStatus === 'AWAITING_CONFIRMATION').length,
        confirmed: todayOrders.filter(o => o.confirmationStatus === 'CONFIRMED').length,
      },
      totals: {
        orders: orders.length,
        codOrders: codOrders.length,
        awaiting,
        confirmed,
        cancelled,
        expired,
        failed,
      },
      rates: {
        confirmationRate: Math.round(confirmationRate * 10) / 10,
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        noResponseRate: Math.round(noResponseRate * 10) / 10,
        whatsappDeliveryRate: Math.round(deliveryRate * 10) / 10,
      },
      estimated: {
        // We explicitly say this is not a guarantee
        note: "These are counts of confirmed/cancelled orders. RTO reduction is not guaranteed; compare against your own historical RTO.",
        potentialRtoPrevented: cancelled, // orders cancelled before shipping
        confirmedReadyToShip: confirmed,
      }
    });
  } catch (e) {
    next(e);
  }
});

export default router;
