import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HEALTH_RATE_LIMIT } from "@/lib/constants";
import { db } from "@/lib/db";
import { clientKeyFromHeaders, takeRateLimit } from "@/lib/rate-limit";

/**
 * Public liveness for uptime monitors (/health, /api/health).
 * App + Postgres only — Redis is non-critical (in-memory rate-limit fallback)
 * and belongs on the secured keepalive cron, not a public probe.
 */

export type HealthPayload = {
  ok: boolean;
  status: "healthy" | "degraded";
  checks: {
    app: "up";
    database: "up" | "down";
  };
  latencyMs: {
    database: number | null;
  };
  timestamp: string;
};

export async function runHealthCheck(): Promise<{
  payload: HealthPayload;
  httpStatus: 200 | 503;
}> {
  const t0 = Date.now();
  let database: "up" | "down" = "down";
  let databaseMs: number | null = null;

  try {
    await db.execute(sql`select 1`);
    database = "up";
    databaseMs = Date.now() - t0;
  } catch {
    database = "down";
    databaseMs = Date.now() - t0;
  }

  const ok = database === "up";
  return {
    payload: {
      ok,
      status: ok ? "healthy" : "degraded",
      checks: { app: "up", database },
      latencyMs: { database: databaseMs },
      timestamp: new Date().toISOString(),
    },
    httpStatus: ok ? 200 : 503,
  };
}

export async function healthResponse(request: Request) {
  const limited = await takeRateLimit(
    clientKeyFromHeaders(request.headers, "health"),
    HEALTH_RATE_LIMIT.limit,
    HEALTH_RATE_LIMIT.windowMs,
  );
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(limited.retryAfterSec),
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }

  const { payload, httpStatus } = await runHealthCheck();
  return NextResponse.json(payload, {
    status: httpStatus,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
