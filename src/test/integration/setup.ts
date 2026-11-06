import "dotenv/config";
import { execSync } from "node:child_process";

/**
 * Always use a dedicated test DB. Do not fall back to `.env` DATABASE_URL
 * (that is often Neon / local `finance` and must never be truncated).
 *
 * Override only with TEST_DATABASE_URL when intentional.
 */
const DEFAULT_TEST_URL =
  "postgresql://finance:finance@127.0.0.1:5432/finance_test";

const testUrl = process.env.TEST_DATABASE_URL?.trim() || DEFAULT_TEST_URL;

process.env.DATABASE_URL = testUrl;
process.env.DATABASE_MIGRATION_URL = testUrl;
process.env.AUTH_SECRET =
  process.env.AUTH_SECRET?.trim() || "integration-test-auth-secret";

execSync("node scripts/db-migrate.mjs", {
  stdio: "inherit",
  env: process.env,
});
