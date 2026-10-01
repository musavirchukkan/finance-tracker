import { healthResponse } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Cron / uptime probe — wakes app + checks DB. */
export async function GET() {
  return healthResponse();
}
