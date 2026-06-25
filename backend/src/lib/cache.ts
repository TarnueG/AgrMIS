// OPTIONAL — drop into backend/src/lib/cache.ts
// If REDIS_URL is set (e.g. an Upstash rediss:// URL), caches go to Redis.
// If unset, falls back to in-memory so nothing breaks. Requires: npm i ioredis
import Redis from 'ioredis';

const url = process.env.REDIS_URL;
const redis = url ? new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 }) : null;
const mem = new Map<string, { v: string; exp: number }>();

if (redis) {
  redis.on('connect', () => console.log('[cache] Redis connected'));
  redis.on('error', (e) => console.warn('[cache] Redis error:', e.message));
} else {
  console.log('[cache] REDIS_URL not set — using in-memory cache');
}

export async function cacheGet(key: string): Promise<string | null> {
  if (redis) { try { return await redis.get(key); } catch { return null; } }
  const hit = mem.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) { mem.delete(key); return null; }
  return hit.v;
}

export async function cacheSet(key: string, value: string, ttlSeconds = 30): Promise<void> {
  if (redis) { try { await redis.set(key, value, 'EX', ttlSeconds); } catch {} return; }
  mem.set(key, { v: value, exp: Date.now() + ttlSeconds * 1000 });
}

export async function cacheDel(key: string): Promise<void> {
  if (redis) { try { await redis.del(key); } catch {} return; }
  mem.delete(key);
}