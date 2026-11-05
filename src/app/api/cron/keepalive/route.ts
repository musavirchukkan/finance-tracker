import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/cron-auth";
import { parseKeepaliveTarget, runKeepalive } from "@/lib/keepalive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * cron-job.org (or any scheduler):
 *   GET /api/cron/keepalive?target=redis
 *   GET /api/cron/keepalive?target=neon
 *   GET /api/cron/keepalive?target=both
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  if (!assertCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const target = parseKeepaliveTarget(
    new URL(request.url).searchParams.get("target"),
  );
  if (!target) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid target. Use ?target=redis | neon | both",
      },
      { status: 400 },
    );
  }

  return runKeepalive(target);
}
