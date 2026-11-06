import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

/**
 * Thin smoke suite. App must already be migrated + seeded
 * (CI / `npm run test:e2e` handles that via webServer + globalSetup).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          NODE_ENV: "production",
          AUTH_SECRET:
            process.env.AUTH_SECRET ?? "e2e-auth-secret-not-for-production",
          // Never inherit app `.env` DATABASE_URL (often Neon).
          DATABASE_URL:
            process.env.TEST_DATABASE_URL ??
            "postgresql://finance:finance@127.0.0.1:5432/finance_test",
          DATABASE_MIGRATION_URL:
            process.env.TEST_DATABASE_URL ??
            "postgresql://finance:finance@127.0.0.1:5432/finance_test",
          ALLOW_PUBLIC_SIGNUP: "false",
          PORT: String(port),
        },
      },
});
