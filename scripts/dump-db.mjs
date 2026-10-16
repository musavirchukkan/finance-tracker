/**
 * Dump a Postgres database via Docker postgres:18 pg_dump (no local client needed).
 *
 * Usage:
 *   node --env-file=.env.prod scripts/dump-db.mjs
 *   DATABASE_MIGRATION_URL=... node scripts/dump-db.mjs
 *
 * Writes backups/neon-<stamp>.dump (custom) + backups/neon-<stamp>-counts.json
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";

/** Safe to print: host, db name, user — never password. */
function describeDatabaseUrl(raw) {
  const source = process.env.DATABASE_MIGRATION_URL
    ? "DATABASE_MIGRATION_URL"
    : "DATABASE_URL";
  try {
    const u = new URL(raw);
    const dbName = decodeURIComponent(u.pathname.replace(/^\//, "") || "(none)");
    const port = u.port ? `:${u.port}` : "";
    const user = u.username ? `${decodeURIComponent(u.username)}@` : "";
    const redacted = `${u.protocol}//${user}${u.hostname}${port}/${dbName}${u.search}`;
    return { source, host: u.hostname, database: dbName, redacted };
  } catch {
    return { source, host: "(unparseable)", database: "(unparseable)", redacted: "(unparseable URL)" };
  }
}

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_MIGRATION_URL or DATABASE_URL");
  process.exit(1);
}

const target = describeDatabaseUrl(url);
console.log(`[dump-db] Env var:  ${target.source}`);
console.log(`[dump-db] Host:     ${target.host}`);
console.log(`[dump-db] Database: ${target.database}`);
console.log(`[dump-db] URL:      ${target.redacted}`);
if (target.host.includes("-pooler")) {
  console.warn(
    "[dump-db] Warning: host looks pooled (-pooler). Prefer DATABASE_MIGRATION_URL (direct) for dumps.",
  );
}

mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dumpName = `neon-${stamp}.dump`;
const dumpPath = `backups/${dumpName}`;

console.log(`[dump-db] Writing ${dumpPath} via postgres:18-alpine…`);
const dump = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-v",
    `${process.cwd()}/backups:/backups`,
    "postgres:18-alpine",
    "pg_dump",
    url,
    "-Fc",
    "--no-owner",
    "--no-acl",
    "-f",
    `/backups/${dumpName}`,
  ],
  { stdio: "inherit" },
);
if (dump.status !== 0) process.exit(dump.status ?? 1);

const TABLES = [
  "users",
  "categories",
  "budgets",
  "bank_accounts",
  "credit_cards",
  "transactions",
  "card_activities",
  "debt_accounts",
  "debt_payments",
  "debt_settings",
  "savings_goals",
];

const sql = postgres(url, { max: 1 });
const counts = {};
try {
  for (const t of TABLES) {
    try {
      const [{ c }] = await sql.unsafe(`SELECT count(*)::int AS c FROM "${t}"`);
      counts[t] = c;
    } catch (e) {
      counts[t] = `ERR: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}

const countsPath = `backups/neon-${stamp}-counts.json`;
writeFileSync(countsPath, JSON.stringify(counts, null, 2) + "\n");
writeFileSync("backups/.latest-dump", `DUMP_FILE=${dumpPath}\n`);
console.log(`[dump-db] Counts → ${countsPath}`);
console.log(JSON.stringify(counts, null, 2));
console.log(`[dump-db] Done. Restore with pg_restore into an empty DB, then run db:import-legacy.`);
