/** App-wide non-secret constants (not env). */

export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_ROUNDS = 12;

/** Deduped Auth.js user existence check window (ms). */
export const SESSION_USER_RECHECK_MS = 60_000;

export const TRANSACTIONS_PAGE_SIZE = 20;
export const TRANSACTIONS_MAX_PAGE_SIZE = 100;
/** Hard cap when a caller omits pagination (prevents accidental full dumps). */
export const TRANSACTIONS_UNBOUNDED_CAP = 500;
export const OVERVIEW_RECENT_TX_LIMIT = 6;
/** Activity audit log page size. */
export const ACTIVITY_PAGE_SIZE = 30;
export const ACTIVITY_MAX_PAGE_SIZE = 100;
/** CSV/JSON export row ceiling. */
export const EXPORT_MAX_ROWS = 10_000;
/** Card activity window for statement math (days). */
export const CARD_ACTIVITY_LOOKBACK_DAYS = 400;

/**
 * Redis TTL for dropdown reference lists (categories / bank+card options).
 * Freshness comes from CRUD `DEL` (lists often sit unchanged for months).
 * Long TTL is only a safety net for missed invalidation / orphaned keys.
 */
export const REF_CACHE_TTL_SEC = 60 * 60 * 24 * 30;

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

/** Authenticated FormData / API ledger mutations (per user). */
export const WRITE_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
/** CSV/JSON export (heavy; per user). */
export const EXPORT_RATE_LIMIT = { limit: 5, windowMs: 60_000 } as const;
/** Password change (stricter; per user). */
export const PASSWORD_CHANGE_RATE_LIMIT = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
} as const;

export const GENERIC_AUTH_ERROR = "Invalid email or password";
export const GENERIC_SIGNUP_ERROR =
  "Could not create account. Try a different email or sign in if you already have one.";
