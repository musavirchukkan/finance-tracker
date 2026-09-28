/** Shared DB URL for CLI scripts (push/seed). Prefer direct Neon URL. */
export function getMigrationDatabaseUrl(): string {
  const url =
    process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error(
      "Set DATABASE_MIGRATION_URL (Neon direct) or DATABASE_URL. See .env.example.",
    );
  }
  return url;
}
