/**
 * Finds the backend on the local network.
 *
 * Typing your computer's IP address is the step people get wrong most often, so the app
 * looks for it instead: take the phone's own address, walk the rest of its /24 subnet and
 * ask each host for /health until one answers like the OrderConfirm backend.
 *
 * The scan is deliberately small (one subnet, one port at a time, short timeout, bounded
 * concurrency) so it finishes in a few seconds and does not flood the network.
 */
import * as Network from 'expo-network';
import { getApiUrl, sanitizeUrl, hostLabel } from './serverConfig';

/** Ports worth trying; 3000 is the backend default. */
const DEFAULT_PORTS = [3000, 8080, 5000];
const PROBE_TIMEOUT_MS = 400;
const CONCURRENCY = 48;

export type DiscoveredServer = { url: string; version?: string; mockMode?: boolean };

export type DiscoveryResult =
  | { ok: true; server: DiscoveredServer; scanned: number }
  | { ok: false; message: string; scanned: number };

/** Ask one host:port whether it is the backend. */
async function probe(url: string): Promise<DiscoveredServer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    if (!response.ok) return null;
    const data: any = await response.json().catch(() => null);
    // /health is only "ours" when it reports status ok.
    if (data && data.status === 'ok') {
      return { url, version: data.version, mockMode: data.mockMode };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Run `tasks` with at most `limit` in flight; stop early once `found` yields something. */
async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>, stop: () => boolean): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      if (stop()) return;
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

function subnetPrefix(ip: string): string | null {
  // Only IPv4 private ranges are worth scanning.
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  const [a, b] = parts;
  const isPrivate =
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  if (!isPrivate) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

/**
 * Scan the phone's own subnet (and, as a fallback, the usual home-router prefixes).
 * `preferredPort` lets the user's current address be tried first.
 */
export async function discoverBackend(onProgress?: (message: string) => void): Promise<DiscoveryResult> {
  let ownIp = '';
  try {
    ownIp = (await Network.getIpAddressAsync()) || '';
  } catch {
    ownIp = '';
  }

  let prefixes: string[] = [];
  const own = subnetPrefix(ownIp);
  if (own) prefixes.push(own);
  // A phone that reports 0.0.0.0 or IPv6 still very often sits on one of these.
  for (const fallback of ['192.168.1', '192.168.0', '192.168.29', '10.0.0']) {
    if (!prefixes.includes(fallback)) prefixes.push(fallback);
  }

  const ports = DEFAULT_PORTS.slice();
  const configuredPort = Number((sanitizeUrl(getApiUrl()).match(/:(\d+)(?:\/|$)/) || [])[1]);
  if (configuredPort && !ports.includes(configuredPort)) ports.unshift(configuredPort);

  const holder: { found: DiscoveredServer | null } = { found: null };
  let scanned = 0;

  // One subnet at a time, so the common case stays at ~254 probes.
  for (const prefix of prefixes) {
    if (holder.found) break;
    for (const port of ports) {
      if (holder.found) break;
      onProgress?.(`Scanning ${prefix}.0/24 on port ${port}...`);

      const hosts = Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`);
      await pool(
        hosts,
        CONCURRENCY,
        async (host) => {
          if (holder.found) return;
          const result = await probe(`http://${host}:${port}`);
          scanned += 1;
          if (result && !holder.found) holder.found = result;
        },
        () => holder.found !== null,
      );
    }
  }

  const found = holder.found;
  if (found) return { ok: true, server: found, scanned };
  return {
    ok: false,
    scanned,
    message:
      'No backend answered on this Wi-Fi. Check that the backend is running and that the phone is on the same network, then enter the address by hand if you know it.',
  };
}
