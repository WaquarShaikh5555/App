import { describe, it, expect } from 'vitest';
import { isCodOrder } from './codDetection';

describe('COD detection', () => {
  it('detects cod gateway', () => {
    expect(isCodOrder({ gateway: 'cash on delivery', financial_status: 'pending', payment_gateway_names: ['cash on delivery'] })).toBe(true);
  });
  it('detects manual + pending as COD', () => {
    expect(isCodOrder({ gateway: 'manual', financial_status: 'pending', payment_gateway_names: ['manual'] })).toBe(true);
  });
  it('ignores prepaid razorpay', () => {
    expect(isCodOrder({ gateway: 'razorpay', financial_status: 'paid', payment_gateway_names: ['razorpay'] })).toBe(false);
  });
  it('detects tag cod', () => {
    expect(isCodOrder({ gateway: 'manual', tags: 'cod, urgent', financial_status: 'pending', payment_gateway_names: ['manual'] })).toBe(true);
  });
});
