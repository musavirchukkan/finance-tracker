import { getRedis } from "@/lib/redis";
import { reportUnexpectedError } from "@/lib/report-error";

/**
 * Optional Redis JSON helpers (HTTPS REST via getRedis).
 * No-ops / DB fallthrough when Redis is unset or errors.
 */

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const value = await redis.get<T>(key);
    return value ?? null;
  } catch (err) {
    reportUnexpectedError(err);
    return null;
  }
}

export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: Math.max(1, ttlSec) });
  } catch (err) {
    reportUnexpectedError(err);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    reportUnexpectedError(err);
  }
}

/** Get cached JSON, or load from `loader`, store with TTL, and return. */
export async function cacheGetOrSetJson<T>(
  key: string,
  ttlSec: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGetJson<T>(key);
  if (hit != null) return hit;
  const value = await loader();
  await cacheSetJson(key, value, ttlSec);
  return value;
}
