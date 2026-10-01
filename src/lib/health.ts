import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
  const started = Date.now();
  let database: "up" | "down" = "down";
  let databaseMs: number | null = null;

  try {
    await db.execute(sql`select 1`);
    database = "up";
    databaseMs = Date.now() - started;
  } catch {
    database = "down";
    databaseMs = Date.now() - started;
  }

  const ok = database === "up";
  const payload: HealthPayload = {
    ok,
    status: ok ? "healthy" : "degraded",
    checks: {
      app: "up",
      database,
    },
    latencyMs: {
      database: databaseMs,
    },
    timestamp: new Date().toISOString(),
  };

  return { payload, httpStatus: ok ? 200 : 503 };
}

export async function healthResponse() {
  const { payload, httpStatus } = await runHealthCheck();
  return NextResponse.json(payload, {
    status: httpStatus,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
