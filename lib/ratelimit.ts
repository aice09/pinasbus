import type { NextRequest } from 'next/server';

// shortcut: per-pod memory, so the limit is per replica; move to Postgres/Redis if this runs more than 2 replicas.
const hits = new Map<string, number[]>();

export function allow(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear();
  return true;
}

// Cloudflare sets cf-connecting-ip; the tunnel and Emissary append to x-forwarded-for.
export const clientIp = (req: NextRequest) =>
  req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
