import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { getMigrationDatabaseUrl } from "./src/lib/env";

/**
 * Drizzle Kit (migrate / generate / emergency push) needs a direct Postgres connection.
 * On Neon: use DATABASE_MIGRATION_URL (non-pooled / "direct").
 * Local Docker: same as DATABASE_URL is fine.
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: getMigrationDatabaseUrl(),
  },
});
