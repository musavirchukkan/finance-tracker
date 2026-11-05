/** App-wide non-secret constants (not env). */

export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_ROUNDS = 12;

/** Deduped Auth.js user existence check window (ms). */
export const SESSION_USER_RECHECK_MS = 60_000;

export const TRANSACTIONS_PAGE_SIZE = 20;
export const TRANSACTIONS_MAX_PAGE_SIZE = 100;
export const OVERVIEW_RECENT_TX_LIMIT = 6;

/** Login / signup abuse limits (Redis when configured; else in-memory). */
export const AUTH_RATE_LIMIT = {
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
} as const;

/**
 * Public /health probe — enough for a monitor every ~1–5 min,
 * blocks scrapers from waking Neon in a tight loop.
 */
export const HEALTH_RATE_LIMIT = {
  limit: 12,
  windowMs: 5 * 60 * 1000,
} as const;

export const GENERIC_AUTH_ERROR = "Invalid email or password";
export const GENERIC_SIGNUP_ERROR =
  "Could not create account. Try a different email or sign in if you already have one.";
