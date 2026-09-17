import { describe, it, expect } from 'vitest';
import { normalizePhone } from './phone';

describe('phone normalization', () => {
  it('normalizes Indian 10-digit', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
  });
  it('keeps E164', () => {
    expect(normalizePhone('+919876543210')).toBe('+919876543210');
  });
  it('handles with spaces', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
  });
  it('returns null for invalid', () => {
    expect(normalizePhone('abc')).toBeNull();
  });
});
