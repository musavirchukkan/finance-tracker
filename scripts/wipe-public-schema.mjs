/**
 * DANGER: DROP SCHEMA public CASCADE on the DB in DATABASE_MIGRATION_URL / DATABASE_URL.
 *
 * Usage:
 *   node --env-file=.env.prod scripts/wipe-public-schema.mjs --i-mean-it
 */
import postgres from "postgres";

if (!process.argv.includes("--i-mean-it")) {
  console.error("Refusing to wipe without --i-mean-it");
  process.exit(1);
}

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_MIGRATION_URL or DATABASE_URL");
  process.exit(1);
}

const u = new URL(url);
const dbName = decodeURIComponent(u.pathname.replace(/^\//, ""));
const source = process.env.DATABASE_MIGRATION_URL
  ? "DATABASE_MIGRATION_URL"
  : "DATABASE_URL";

console.log(`[wipe] Env:      ${source}`);
console.log(`[wipe] Host:     ${u.hostname}`);
console.log(`[wipe] Database: ${dbName}`);
if (u.hostname.includes("-pooler")) {
  console.warn("[wipe] Warning: pooled host — prefer direct URL");
}

const sql = postgres(url, { max: 1 });
try {
  const before = await sql`
    SELECT count(*)::int AS c
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  console.log(`[wipe] Tables before: ${before[0].c}`);

  await sql.unsafe("DROP SCHEMA public CASCADE");
  await sql.unsafe("CREATE SCHEMA public");
  await sql.unsafe("GRANT ALL ON SCHEMA public TO public");

  const role = decodeURIComponent(u.username || "");
  if (role) {
    try {
      await sql.unsafe(`GRANT ALL ON SCHEMA public TO "${role.replaceAll('"', '""')}"`);
      console.log(`[wipe] Granted schema to role: ${role}`);
    } catch (e) {
      console.warn(
        "[wipe] GRANT to role skipped:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Drop drizzle migrations schema/table if present outside public
  await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");

  const after = await sql`
    SELECT count(*)::int AS c
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  console.log(`[wipe] Tables after: ${after[0].c}`);
  console.log("[wipe] Done. Schema is empty. Run migrate when ready.");
} finally {
  await sql.end({ timeout: 5 });
}
