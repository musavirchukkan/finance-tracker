import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit (db:push / migrate) needs a direct Postgres connection.
 * On Neon: use DATABASE_MIGRATION_URL (non-pooled / "direct").
 * Local Docker: same as DATABASE_URL is fine.
 */
const migrationUrl =
  process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "Set DATABASE_MIGRATION_URL (Neon direct) or DATABASE_URL for drizzle-kit.",
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
});
