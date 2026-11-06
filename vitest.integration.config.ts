import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * DB-backed integration tests. Requires a migrated Postgres
 * (local Docker `finance_test` or CI service). See docs/TESTING.md.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["./src/test/integration/setup.ts"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
