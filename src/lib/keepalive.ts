import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

/**
 * Secured warm/ping for Redis and/or Neon.
 * GET /api/cron/keepalive?target=redis|neon|both (+ CRON_SECRET).
 */
export type KeepaliveTarget = "redis" | "neon" | "both";

export function parseKeepaliveTarget(
  raw: string | null | undefined,
): KeepaliveTarget | null {
  if (raw === null || raw === undefined || raw === "") return "both";
  if (raw === "redis" || raw === "neon" || raw === "both") return raw;
  if (raw === "db" || raw === "postgres") return "neon";
  return null;
}

export async function runKeepalive(target: KeepaliveTarget) {
  const started = Date.now();
  const wantNeon = target === "neon" || target === "both";
  const wantRedis = target === "redis" || target === "both";

  const [database, redisResult] = await Promise.all([
    wantNeon ? pingDatabase() : Promise.resolve(null),
    wantRedis ? pingRedis() : Promise.resolve(null),
  ]);

  const ok =
    (database === null || database.ok) &&
    (redisResult === null || redisResult.ok);

  return NextResponse.json(
    {
      ok,
      target,
      checks: {
        database: database
          ? database.ok
            ? "up"
            : "down"
          : "skipped",
        redis: redisResult ? redisResult.status : "skipped",
      },
      latencyMs: {
        database: database?.ms ?? null,
        redis: redisResult?.ms ?? null,
        total: Date.now() - started,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}

async function pingDatabase(): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, ms: Date.now() - t0 };
  } catch {
    return { ok: false, ms: Date.now() - t0 };
  }
}

async function pingRedis(): Promise<{
  ok: boolean;
  status: "up" | "down" | "skipped";
  ms: number | null;
}> {
  const redis = getRedis();
  if (!redis) {
    return { ok: true, status: "skipped", ms: null };
  }
  const t0 = Date.now();
  try {
    await redis.set("keepalive", Date.now(), { ex: 300 });
    return { ok: true, status: "up", ms: Date.now() - t0 };
  } catch {
    return { ok: false, status: "down", ms: Date.now() - t0 };
  }
}
