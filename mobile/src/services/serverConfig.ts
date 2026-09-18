/**
 * The backend address, editable at runtime.
 *
 * The app has to talk to a backend somewhere, and "somewhere" changes: an emulator
 * (10.0.2.2), a phone on the same Wi-Fi (a LAN address), a tunnel (https://…ngrok.io),
 * or a deployed server. Baking that into the build meant a rebuild for every change, so
 * it lives here instead: persisted on the device and editable from Settings → Server.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { DEFAULT_API_URL } from '../utils/config';

const STORAGE_KEY = 'orderconfirm_api_url';

let cached: string | null = null;

/** Trim spaces, add a scheme when missing, drop trailing slashes. */
export function sanitizeUrl(raw: string): string {
  let value = (raw || '').trim();
  if (!value) return '';
  // People paste "192.168.1.7:3000" or "ngrok-free.app" without a scheme.
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value.replace(/\/+$/, '');
}

export function getApiUrl(): string {
  return cached || DEFAULT_API_URL;
}

/** Load the saved address into memory; call once at startup. */
export async function loadApiUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) cached = sanitizeUrl(stored);
  } catch {
    // storage failure is not fatal: fall back to the build-time default
  }
  return getApiUrl();
}

export async function setApiUrl(raw: string): Promise<string> {
  const clean = sanitizeUrl(raw);
  if (!clean) return resetApiUrl();
  cached = clean;
  await AsyncStorage.setItem(STORAGE_KEY, clean);
  return clean;
}

export async function resetApiUrl(): Promise<string> {
  cached = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
  return DEFAULT_API_URL;
}

/** Has the user (or a previous auto-scan) ever chosen an address? */
export async function hasSavedApiUrl(): Promise<boolean> {
  try {
    return Boolean(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function hostLabel(url?: string): string {
  return (url || getApiUrl()).replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export type ConnectionResult = {
  ok: boolean;
  message: string;
  details?: { version?: string; mockMode?: boolean; name?: string };
};

/**
 * Ask the backend whether it is alive: GET /health.
 * Returns a message written for a human, because "Network Error" tells nobody anything.
 */
export async function testConnection(rawUrl?: string): Promise<ConnectionResult> {
  const base = sanitizeUrl(rawUrl || getApiUrl());
  if (!base) return { ok: false, message: 'Enter a server address first.' };

  try {
    const res = await axios.get(`${base}/health`, { timeout: 8000 });
    const data = res.data || {};
    if (res.status !== 200 || (data.status && data.status !== 'ok')) {
      return { ok: false, message: `Reached ${hostLabel(base)} but it did not answer like the OrderConfirm backend.` };
    }
    return {
      ok: true,
      message: `Connected to ${hostLabel(base)}`,
      details: { version: data.version, mockMode: data.mockMode, name: data.name },
    };
  } catch (error: any) {
    return { ok: false, message: explainConnectionFailure(error, base) };
  }
}

export function explainConnectionFailure(error: any, base?: string): string {
  const target = hostLabel(base);
  if (error?.response) {
    const status = error.response.status;
    if (status === 404) {
      return `Reached ${target}, but there is no OrderConfirm backend there (HTTP 404 on /health). Check the address.`;
    }
    return `${target} answered with HTTP ${status}. It is probably not the OrderConfirm backend.`;
  }
  switch (error?.code) {
    case 'ECONNABORTED':
      return `${target} did not respond in time. Is the backend still starting up?`;
    case 'ENOTFOUND':
      return `Could not find "${target}". Check the address for typos.`;
    case 'ECONNREFUSED':
      return `Nothing is listening on ${target}. Is the backend running?`;
    case 'ERR_NETWORK':
      return `The phone could not reach ${target}. Either the backend is not running, or the phone is on a different network (or the URL is plain http and blocked).`;
    default:
      return `Could not reach ${target}${error?.message ? `: ${error.message}` : '.'}`;
  }
}
