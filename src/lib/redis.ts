import { Redis } from "@upstash/redis";
import { getEnv } from "@/lib/env";

/** Re-export so callers never import the SDK package directly. */
export type { Redis };

const globalForRedis = globalThis as unknown as {
  __financeRedis?: Redis | null;
};

/**
 * HTTPS Redis REST client (Upstash-compatible). No TCP sockets.
 * Returns null when REDIS_REST_URL / REDIS_REST_TOKEN are unset.
 */
export function getRedis(): Redis | null {
  if (globalForRedis.__financeRedis !== undefined) {
    return globalForRedis.__financeRedis;
  }

  const { redisRestUrl, redisRestToken } = getEnv();
  if (!redisRestUrl || !redisRestToken) {
    globalForRedis.__financeRedis = null;
    return null;
  }

  const client = new Redis({
    url: redisRestUrl,
    token: redisRestToken,
    retry: { retries: 1, backoff: (i) => 50 * (i + 1) },
  });

  globalForRedis.__financeRedis = client;
  return client;
}

export function isRedisConfigured(): boolean {
  return getRedis() !== null;
}
