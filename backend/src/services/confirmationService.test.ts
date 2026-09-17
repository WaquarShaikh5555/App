import { describe, it, expect } from 'vitest';
import { canTransition } from './confirmationService';

describe('state machine', () => {
  it('allows NEW -> AWAITING', () => {
    expect(canTransition('NEW', 'AWAITING_CONFIRMATION')).toBe(true);
  });
  it('disallows CONFIRMED -> CANCELLED directly', () => {
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(false);
  });
  it('allows AWAITING -> CONFIRMED', () => {
    expect(canTransition('AWAITING_CONFIRMATION', 'CONFIRMED')).toBe(true);
  });
  it('allows AWAITING -> CANCEL_REQUESTED', () => {
    expect(canTransition('AWAITING_CONFIRMATION', 'CANCEL_REQUESTED')).toBe(true);
  });
  it('allows CANCEL_REQUESTED -> CANCELLED', () => {
    expect(canTransition('CANCEL_REQUESTED', 'CANCELLED')).toBe(true);
  });
});
