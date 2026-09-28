/**
 * Runs on Vercel (and local) during `npm run build`.
 * Applies schema with drizzle-kit push (non-interactive).
 * Does NOT seed users — run `npm run db:seed` once from your machine.
 */
import { execSync } from "node:child_process";

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;

if (!url) {
  console.warn(
    "[migrate-on-deploy] No DATABASE_MIGRATION_URL / DATABASE_URL — skipping schema push.",
  );
  process.exit(0);
}

console.log("[migrate-on-deploy] Pushing schema with drizzle-kit…");
execSync("npx drizzle-kit push --force", {
  stdio: "inherit",
  env: process.env,
});
console.log("[migrate-on-deploy] Done.");
