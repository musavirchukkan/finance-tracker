/**
 * Runs on Vercel (and local) during `npm run build`.
 * 1) One-shot data moves (due-day → due-gap) while old columns still exist
 * 2) Applies schema with drizzle-kit push (non-interactive).
 * Does NOT seed users — run `npm run db:seed` once from your machine.
 */
import { execSync } from "node:child_process";
import postgres from "postgres";

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;

if (!url) {
  console.warn(
    "[migrate-on-deploy] No DATABASE_MIGRATION_URL / DATABASE_URL — skipping schema push.",
  );
  process.exit(0);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDay(day, year, monthIndex) {
  return Math.min(Math.max(1, day), daysInMonth(year, monthIndex));
}

/** Calendar days from bill day-of-month to due day-of-month (old card fields). */
function gapFromBillingAndDueDay(billingDay, dueDay) {
  if (!billingDay || !dueDay) return 20;
  const y = 2024;
  const m = 0; // January reference
  const billDom = clampDay(billingDay, y, m);
  const bill = new Date(y, m, billDom, 12, 0, 0, 0);
  let dueM = m;
  let dueY = y;
  let dueDom = clampDay(dueDay, dueY, dueM);
  let due = new Date(dueY, dueM, dueDom, 12, 0, 0, 0);
  if (due <= bill) {
    dueM += 1;
    if (dueM > 11) {
      dueM = 0;
      dueY += 1;
    }
    dueDom = clampDay(dueDay, dueY, dueM);
    due = new Date(dueY, dueM, dueDom, 12, 0, 0, 0);
  }
  return Math.max(1, Math.round((due.getTime() - bill.getTime()) / 86400000));
}

async function migrateDueGapBeforePush() {
  const sql = postgres(url, { max: 1 });
  try {
    const cols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'credit_cards'
    `;
    const names = new Set(cols.map((c) => c.column_name));
    if (!names.has("payment_due_day")) {
      console.log("[migrate-on-deploy] No payment_due_day — skip due-gap backfill.");
      return;
    }

    if (!names.has("payment_due_gap_days")) {
      await sql`
        ALTER TABLE credit_cards
        ADD COLUMN payment_due_gap_days integer
      `;
      console.log("[migrate-on-deploy] Added payment_due_gap_days.");
    }

    const rows = await sql`
      SELECT id, billing_day, payment_due_day, payment_due_gap_days
      FROM credit_cards
    `;
    for (const row of rows) {
      if (row.payment_due_gap_days != null) continue;
      const gap = gapFromBillingAndDueDay(row.billing_day, row.payment_due_day);
      await sql`
        UPDATE credit_cards
        SET payment_due_gap_days = ${gap}
        WHERE id = ${row.id}
      `;
    }
    console.log(
      `[migrate-on-deploy] Backfilled payment_due_gap_days for ${rows.length} card(s).`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

console.log("[migrate-on-deploy] Pre-push data migrations…");
await migrateDueGapBeforePush();

console.log("[migrate-on-deploy] Pushing schema with drizzle-kit…");
execSync("npx drizzle-kit push --force", {
  stdio: "inherit",
  env: process.env,
});
console.log("[migrate-on-deploy] Done.");
