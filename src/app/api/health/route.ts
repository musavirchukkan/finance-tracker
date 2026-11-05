import { healthResponse } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Uptime probe — app + Postgres (rate-limited). Redis is checked via keepalive. */
export async function GET(request: Request) {
  return healthResponse(request);
}
