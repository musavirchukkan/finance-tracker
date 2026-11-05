/**
 * Client-facing errors. Prefer throwing these from server actions so the UI
 * can show a controlled message without leaking driver/stack details.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

const UNSAFE =
  /(?:ECONN|EPERM|postgres|neon|drizzle|SQLSTATE|node_modules|at\s+\S+\s+\(|TypeError:|Cannot read)/i;

/** Map unknown failures to a safe toast string (M3). */
export function clientErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Try again.",
): string {
  if (err instanceof UserFacingError) {
    const msg = err.message.trim();
    return msg || fallback;
  }
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    (err as { name?: string }).name === "ZodError" &&
    "issues" in err &&
    Array.isArray((err as { issues: { message?: string }[] }).issues)
  ) {
    const first = (err as { issues: { message?: string }[] }).issues[0]
      ?.message;
    if (first?.trim()) return first.trim();
  }
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (msg && msg.length <= 160 && !UNSAFE.test(msg)) {
      return msg;
    }
  }
  return fallback;
}
