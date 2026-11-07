import { UserFacingError } from "@/lib/safe-error";
import { getRedis, type Redis } from "@/lib/redis";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Fixed window: INCR, EXPIRE on first hit, return TTL.
 * createScript → EVALSHA after first load (one HTTPS round-trip per take).
 */
const RATE_LIMIT_LUA = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return { count, ttl }
`;

type RateLimitLuaResult = [number, number];

type RateLimitScript = {
  eval: (keys: string[], args: string[]) => Promise<RateLimitLuaResult>;
};

let rateLimitScript: RateLimitScript | null = null;

function getRateLimitScript(redis: Redis): RateLimitScript {
  if (!rateLimitScript) {
    rateLimitScript = redis.createScript<RateLimitLuaResult>(RATE_LIMIT_LUA);
  }
  return rateLimitScript;
}

/**
 * Fixed-window rate limit.
 * Uses Redis REST (HTTPS) when configured; otherwise in-memory
 * (fine for local single-process; not shared across serverless isolates).
 */
export async function takeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const redis = getRedis();
  if (redis) {
    return takeRedisRateLimit(redis, key, limit, windowMs);
  }
  return takeMemoryRateLimit(key, limit, windowMs);
}

async function takeRedisRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const redisKey = `rl:${key}`;

  const [countRaw, ttlRaw] = await getRateLimitScript(redis).eval(
    [redisKey],
    [String(windowSec)],
  );

  const count = Number(countRaw);
  const ttl = Number(ttlRaw);

  if (count > limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, ttl > 0 ? ttl : windowSec),
    };
  }
  return { ok: true };
}

function takeMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (cur.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
    };
  }
  cur.count += 1;
  return { ok: true };
}

export function clientKeyFromHeaders(
  headersList: Headers,
  prefix: string,
): string {
  const forwarded = headersList.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    "unknown";
  return `${prefix}:${ip}`;
}

/**
 * Per-user rate limit for authenticated mutations / export.
 * Throws UserFacingError when exceeded (Server Actions).
 */
export async function assertWriteRateLimit(
  userId: string,
  bucket: "write" | "export" | "password",
  limit: number,
  windowMs: number,
): Promise<void> {
  const result = await takeRateLimit(`${bucket}:${userId}`, limit, windowMs);
  if (!result.ok) {
    throw new UserFacingError("Too many requests. Try again shortly.");
  }
}

/** Same as assertWriteRateLimit but returns whether the call was allowed. */
export async function takeUserRateLimit(
  userId: string,
  bucket: "write" | "export" | "password",
  limit: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  return takeRateLimit(`${bucket}:${userId}`, limit, windowMs);
}
