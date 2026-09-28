import { NextResponse } from "next/server";

/** Lightweight probe endpoint (Docker / uptime checkers). */
export async function GET() {
  return NextResponse.json({ ok: true });
}
