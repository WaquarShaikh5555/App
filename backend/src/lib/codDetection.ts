/**
 * COD detection logic for Shopify orders
 * Conservative detection to avoid false positives
 */
export interface ShopifyOrderLike {
  gateway?: string;
  payment_gateway_names?: string[];
  financial_status?: string;
  tags?: string;
  payment_details?: any;
  note?: string;
  total_price?: string;
  [key: string]: any;
}

const COD_KEYWORDS = [
  'cash on delivery',
  'cod',
  'cash_on_delivery',
  'cash-on-delivery',
  'manual',
  'cash',
];

export function isCodOrder(order: ShopifyOrderLike): boolean {
  const gateway = (order.gateway || '').toLowerCase();
  const tags = (order.tags || '').toLowerCase();
  const financial = (order.financial_status || '').toLowerCase();
  const gateways = (order.payment_gateway_names || []).map((g: string) => g.toLowerCase());
  const note = (order.note || '').toLowerCase();

  // Direct keyword in gateway
  if (COD_KEYWORDS.some(k => gateway.includes(k))) {
    // manual can be prepaid manual too, so extra check: if financial_status pending and gateway manual => likely COD
    if (gateway === 'manual' && financial === 'pending') return true;
    if (gateway !== 'manual') return true;
  }

  // Check gateway names array
  for (const g of gateways) {
    if (g.includes('cod') || g.includes('cash') || g.includes('cash on delivery')) return true;
    if (g === 'manual' && financial === 'pending') return true;
  }

  // Tags
  if (tags.includes('cod') || tags.includes('cash on delivery')) return true;

  // Note contains COD
  if (note.includes('cod') || note.includes('cash on delivery')) return true;

  // If financial_status pending and no prepaid gateway like razorpay, stripe, etc
  // This is heuristic, keep conservative
  if (financial === 'pending') {
    const prepaidGateways = ['razorpay', 'stripe', 'paypal', 'shopify_payments', 'credit_card', 'upi'];
    const hasPrepaid = gateways.some(g => prepaidGateways.some(p => g.includes(p)));
    if (!hasPrepaid && gateways.length > 0) {
      // If only manual or cod gateways, treat as COD
      return gateways.every(g => g === 'manual' || g.includes('cod') || g.includes('cash'));
    }
  }

  return false;
}

export function shouldIgnorePrepaid(order: ShopifyOrderLike, ignorePrepaid: boolean): boolean {
  if (!ignorePrepaid) return false;
  return !isCodOrder(order);
}
