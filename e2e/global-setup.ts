import "dotenv/config";
import { execSync } from "node:child_process";

/**
 * Migrate finance_test, ensure e2e user, and build the app.
 * Ignores app `.env` DATABASE_URL — uses TEST_DATABASE_URL or local finance_test.
 */
export default function globalSetup() {
  const databaseUrl =
    process.env.TEST_DATABASE_URL?.trim() ||
    "postgresql://finance:finance@127.0.0.1:5432/finance_test";

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    AUTH_SECRET:
      process.env.AUTH_SECRET?.trim() || "e2e-auth-secret-not-for-production",
    E2E_EMAIL: process.env.E2E_EMAIL ?? "e2e@example.test",
    E2E_PASSWORD: process.env.E2E_PASSWORD ?? "e2e-password-123",
    E2E_NAME: process.env.E2E_NAME ?? "E2E User",
  };

  execSync("node scripts/db-migrate.mjs", { stdio: "inherit", env });
  execSync("npx tsx e2e/seed-e2e-user.ts", { stdio: "inherit", env });

  if (!process.env.E2E_SKIP_BUILD) {
    execSync("npm run build:app", { stdio: "inherit", env });
  }
}
