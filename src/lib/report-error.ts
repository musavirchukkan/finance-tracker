import * as Sentry from "@sentry/nextjs";
import { UserFacingError } from "@/lib/safe-error";

function isExpectedClientError(err: unknown): boolean {
  if (err instanceof UserFacingError) return true;
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    ((err as { name?: string }).name === "UserFacingError" ||
      (err as { name?: string }).name === "ZodError")
  ) {
    return true;
  }
  return false;
}

/** Report unexpected failures to Sentry (no-op when DSN unset). */
export function reportUnexpectedError(err: unknown): void {
  if (isExpectedClientError(err)) return;
  Sentry.captureException(err);
}
