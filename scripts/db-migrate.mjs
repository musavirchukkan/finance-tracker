/**
 * Apply committed Drizzle migrations (non-interactive).
 * Used by `npm run build` and `npm run db:migrate`.
 */
import { execSync } from "node:child_process";

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;

if (!url) {
  console.warn(
    "[db-migrate] No DATABASE_MIGRATION_URL / DATABASE_URL — skipping migrations.",
  );
  process.exit(0);
}

console.log("[db-migrate] Applying drizzle migrations…");
execSync("npx drizzle-kit migrate", {
  stdio: "inherit",
  env: process.env,
});
console.log("[db-migrate] Done.");
