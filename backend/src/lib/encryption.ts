import crypto from 'crypto';
import { config } from '../config';

const ALGO = 'aes-256-gcm';
function getKey(): Buffer {
  const hex = config.encryptionKey;
  // allow hex string of 64 chars or raw string
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  // hash to 32 bytes if not hex
  return crypto.createHash('sha256').update(hex).digest();
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // store iv + tag + encrypted as base64
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt(b64: string): string {
  const key = getKey();
  const data = Buffer.from(b64, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskPhone(e164: string): string {
  if (!e164) return '';
  // keep country code and last 4
  // e.g. +919876543210 -> +91****3210
  if (e164.length <= 8) return e164.slice(0,2) + '****' + e164.slice(-2);
  const visibleStart = e164.slice(0,3);
  const visibleEnd = e164.slice(-4);
  const masked = '*'.repeat(Math.max(4, e164.length - visibleStart.length - visibleEnd.length));
  return `${visibleStart}${masked}${visibleEnd}`;
}
