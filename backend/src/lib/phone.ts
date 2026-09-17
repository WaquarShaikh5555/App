import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhone(raw: string, defaultCountry: string = 'IN'): string | null {
  if (!raw) return null;
  try {
    const cleaned = raw.toString().trim();
    const phone = parsePhoneNumberFromString(cleaned, defaultCountry as any);
    if (phone && phone.isValid()) {
      return phone.format('E.164');
    }
    // fallback: strip non-digits, add +
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length >= 10) {
      // if already includes country, keep
      if (cleaned.startsWith('+')) return `+${digits}`;
      // try with default country code inference: if 10 digits assume IN +91
      if (digits.length === 10) return `+91${digits}`;
      return `+${digits}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
