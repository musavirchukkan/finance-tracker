import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * cron-job.org (or any scheduler) should send `Authorization: Bearer <CRON_SECRET>`.
 * Rejects when secret is unset (never treat missing env as open).
 */
export function assertCronAuthorized(request: Request): boolean {
  const secret = getEnv().cronSecret;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  const provided = header.slice("Bearer ".length);
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
