import { z } from "zod";

/**
 * Single source of truth for env *key names* and validated values.
 * App code should import `env` / helpers from here — not `process.env.X` —
 * so renaming a key only requires updating this file (+ .env.example).
 */
export const EnvKeys = {
  DATABASE_URL: "DATABASE_URL",
  DATABASE_MIGRATION_URL: "DATABASE_MIGRATION_URL",
  AUTH_SECRET: "AUTH_SECRET",
  /** Public app URL for Auth.js callbacks (optional locally; set on deploy). */
  AUTH_URL: "AUTH_URL",
  NODE_ENV: "NODE_ENV",
  ALLOW_PUBLIC_SIGNUP: "ALLOW_PUBLIC_SIGNUP",
  SIGNUP_INVITE_CODE: "SIGNUP_INVITE_CODE",
  SEED_EMAIL: "SEED_EMAIL",
  SEED_PASSWORD: "SEED_PASSWORD",
  SEED_NAME: "SEED_NAME",
  /** HTTPS Redis REST gateway (Upstash-compatible; not redis://). */
  REDIS_REST_URL: "REDIS_REST_URL",
  REDIS_REST_TOKEN: "REDIS_REST_TOKEN",
  /** External cron (e.g. cron-job.org) sends Authorization: Bearer <CRON_SECRET>. */
  CRON_SECRET: "CRON_SECRET",
} as const;

const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    return v === "true" || v === "1";
  });

const schema = z.object({
  [EnvKeys.DATABASE_URL]: z.string().min(1, "DATABASE_URL is required"),
  [EnvKeys.DATABASE_MIGRATION_URL]: z.string().optional(),
  [EnvKeys.AUTH_SECRET]: z.string().optional(),
  [EnvKeys.AUTH_URL]: z.string().optional(),
  [EnvKeys.NODE_ENV]: z
    .enum(["development", "test", "production"])
    .optional()
    .default("development"),
  [EnvKeys.ALLOW_PUBLIC_SIGNUP]: boolish,
  [EnvKeys.SIGNUP_INVITE_CODE]: z.string().optional(),
  [EnvKeys.SEED_EMAIL]: z.string().optional(),
  [EnvKeys.SEED_PASSWORD]: z.string().optional(),
  [EnvKeys.SEED_NAME]: z.string().optional(),
  [EnvKeys.REDIS_REST_URL]: z.string().optional(),
  [EnvKeys.REDIS_REST_TOKEN]: z.string().optional(),
  [EnvKeys.CRON_SECRET]: z.string().optional(),
});

export type AppEnv = {
  databaseUrl: string;
  databaseMigrationUrl: string | undefined;
  authSecret: string | undefined;
  authUrl: string | undefined;
  nodeEnv: "development" | "test" | "production";
  allowPublicSignup: boolean;
  signupInviteCode: string | undefined;
  seedEmail: string;
  seedPassword: string;
  seedName: string;
  redisRestUrl: string | undefined;
  redisRestToken: string | undefined;
  cronSecret: string | undefined;
};

let cached: AppEnv | null = null;

function readRaw(): Record<string, string | undefined> {
  return {
    [EnvKeys.DATABASE_URL]: process.env[EnvKeys.DATABASE_URL],
    [EnvKeys.DATABASE_MIGRATION_URL]:
      process.env[EnvKeys.DATABASE_MIGRATION_URL],
    [EnvKeys.AUTH_SECRET]: process.env[EnvKeys.AUTH_SECRET],
    [EnvKeys.AUTH_URL]: process.env[EnvKeys.AUTH_URL],
    [EnvKeys.NODE_ENV]: process.env[EnvKeys.NODE_ENV],
    [EnvKeys.ALLOW_PUBLIC_SIGNUP]: process.env[EnvKeys.ALLOW_PUBLIC_SIGNUP],
    [EnvKeys.SIGNUP_INVITE_CODE]: process.env[EnvKeys.SIGNUP_INVITE_CODE],
    [EnvKeys.SEED_EMAIL]: process.env[EnvKeys.SEED_EMAIL],
    [EnvKeys.SEED_PASSWORD]: process.env[EnvKeys.SEED_PASSWORD],
    [EnvKeys.SEED_NAME]: process.env[EnvKeys.SEED_NAME],
    [EnvKeys.REDIS_REST_URL]: process.env[EnvKeys.REDIS_REST_URL],
    [EnvKeys.REDIS_REST_TOKEN]: process.env[EnvKeys.REDIS_REST_TOKEN],
    [EnvKeys.CRON_SECRET]: process.env[EnvKeys.CRON_SECRET],
  };
}

/** Validate and cache env. Safe to call from app code and seeds. */
export function getEnv(): AppEnv {
  if (cached) return cached;

  const parsed = schema.safeParse(readRaw());
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${detail}. See .env.example.`);
  }

  const raw = parsed.data;
  const nodeEnv = raw[EnvKeys.NODE_ENV] ?? "development";

  if (nodeEnv === "production" && !raw[EnvKeys.AUTH_SECRET]) {
    throw new Error("AUTH_SECRET is required in production");
  }

  const redisRestUrl = raw[EnvKeys.REDIS_REST_URL]?.trim() || undefined;
  const redisRestToken = raw[EnvKeys.REDIS_REST_TOKEN]?.trim() || undefined;

  if ((redisRestUrl && !redisRestToken) || (!redisRestUrl && redisRestToken)) {
    throw new Error(
      "Set both REDIS_REST_URL and REDIS_REST_TOKEN, or neither. See .env.example.",
    );
  }
  if (redisRestUrl) {
    try {
      void new URL(redisRestUrl);
    } catch {
      throw new Error(
        "REDIS_REST_URL must be a valid HTTPS URL. See .env.example.",
      );
    }
  }

  cached = {
    databaseUrl: raw[EnvKeys.DATABASE_URL],
    databaseMigrationUrl: raw[EnvKeys.DATABASE_MIGRATION_URL] || undefined,
    authSecret: raw[EnvKeys.AUTH_SECRET] || undefined,
    authUrl: raw[EnvKeys.AUTH_URL]?.trim() || undefined,
    nodeEnv,
    // Default: signup open. Set ALLOW_PUBLIC_SIGNUP=false to lock down.
    allowPublicSignup: raw[EnvKeys.ALLOW_PUBLIC_SIGNUP] ?? true,
    signupInviteCode: raw[EnvKeys.SIGNUP_INVITE_CODE]?.trim() || undefined,
    seedEmail: (raw[EnvKeys.SEED_EMAIL] ?? "you@example.com").toLowerCase(),
    seedPassword: raw[EnvKeys.SEED_PASSWORD] ?? "changeme123",
    seedName: raw[EnvKeys.SEED_NAME] ?? "Musavir",
    redisRestUrl,
    redisRestToken,
    cronSecret: raw[EnvKeys.CRON_SECRET]?.trim() || undefined,
  };

  return cached;
}

/** Prefer direct Neon URL for migrate/seed; fall back to pooled app URL. */
export function getMigrationDatabaseUrl(): string {
  const e = getEnv();
  const url = e.databaseMigrationUrl ?? e.databaseUrl;
  if (!url) {
    throw new Error(
      "Set DATABASE_MIGRATION_URL (Neon direct) or DATABASE_URL. See .env.example.",
    );
  }
  return url;
}

/** Opaque DB fingerprint material (host + db name) for session binding. */
export function getDatabaseFingerprintMaterial(): string {
  const raw = getEnv().databaseUrl;
  try {
    const u = new URL(raw);
    return `${u.host}${u.pathname}`;
  } catch {
    return "unknown";
  }
}
