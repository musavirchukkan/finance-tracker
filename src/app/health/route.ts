import { NextResponse } from "next/server";

/** Some probes hit /health instead of /api/health. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
