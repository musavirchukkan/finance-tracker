import { healthResponse } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Some probes hit /health instead of /api/health. */
export async function GET() {
  return healthResponse();
}
