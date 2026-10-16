/**
 * Copy data from a legacy DB (restored dump) into a clean target that already
 * has the current schema (drizzle migrate applied). Preserves UUIDs.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=postgresql://finance:finance@localhost:5432/finance_legacy \
 *   TARGET_DATABASE_URL=postgresql://finance:finance@localhost:5432/finance \
 *   npx tsx scripts/import-legacy-data.ts
 *
 * Guard: target must have zero users unless --force is passed (still requires empty users).
 */
import postgres from "postgres";

const SOURCE = process.env.SOURCE_DATABASE_URL;
const TARGET = process.env.TARGET_DATABASE_URL;

if (!SOURCE || !TARGET) {
  console.error(
    "Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL (legacy restore → clean migrate DB).",
  );
  process.exit(1);
}

if (SOURCE === TARGET) {
  console.error("SOURCE and TARGET must be different databases.");
  process.exit(1);
}

const force = process.argv.includes("--force");

type Row = Record<string, unknown>;

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDay(day: number, year: number, monthIndex: number) {
  return Math.min(Math.max(1, day), daysInMonth(year, monthIndex));
}

/** Estimate gap days from legacy billing_day + payment_due_day. */
function gapFromBillingAndDueDay(
  billingDay: number | null | undefined,
  dueDay: number | null | undefined,
): number {
  if (!billingDay || !dueDay) return 20;
  const y = 2024;
  const m = 0;
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

async function tableColumns(sql: postgres.Sql, table: string): Promise<Set<string>> {
  const rows = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return new Set(rows.map((r) => String(r.column_name)));
}

async function count(sql: postgres.Sql, table: string): Promise<number> {
  const [{ c }] = await sql.unsafe(`SELECT count(*)::int AS c FROM "${table}"`);
  return Number(c);
}

async function selectAll(sql: postgres.Sql, table: string): Promise<Row[]> {
  return (await sql.unsafe(`SELECT * FROM "${table}"`)) as unknown as Row[];
}

async function insertRows(
  sql: postgres.Sql,
  table: string,
  rows: Row[],
  columns: string[],
) {
  if (rows.length === 0) return;
  const colList = columns.map((c) => `"${c}"`).join(", ");
  for (const row of rows) {
    const values = columns.map((c) => row[c] ?? null);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    await sql.unsafe(
      `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`,
      values as never[],
    );
  }
}

async function main() {
  const src = postgres(SOURCE!, { max: 1 });
  const dst = postgres(TARGET!, { max: 1 });

  try {
    const targetUsers = await count(dst, "users");
    if (targetUsers > 0 && !force) {
      console.error(
        `Target already has ${targetUsers} user(s). Refusing import. Wipe target or pass --force after truncate.`,
      );
      process.exit(1);
    }
    if (targetUsers > 0 && force) {
      console.error(
        "--force still requires an empty target (truncate all app tables first).",
      );
      process.exit(1);
    }

    const srcCardCols = await tableColumns(src, "credit_cards");
    const dstCardCols = await tableColumns(dst, "credit_cards");
    const srcDebtCols = await tableColumns(src, "debt_accounts");
    const srcPayCols = await tableColumns(src, "debt_payments");

    console.log("[import] Copying users…");
    const users = await selectAll(src, "users");
    await insertRows(dst, "users", users, [
      "id",
      "email",
      "name",
      "password_hash",
      "created_at",
    ]);

    console.log("[import] Copying categories…");
    const categories = await selectAll(src, "categories");
    await insertRows(dst, "categories", categories, [
      "id",
      "user_id",
      "name",
      "kind",
      "icon",
      "sort_order",
    ]);

    console.log("[import] Copying debt_settings…");
    const debtSettings = await selectAll(src, "debt_settings");
    await insertRows(dst, "debt_settings", debtSettings, [
      "user_id",
      "goal_payoff_date",
    ]);

    console.log("[import] Copying bank_accounts…");
    const banks = await selectAll(src, "bank_accounts");
    await insertRows(dst, "bank_accounts", banks, [
      "id",
      "user_id",
      "name",
      "current_balance",
      "min_balance",
      "balance_rules",
      "last_four",
      "account_type",
      "status",
      "created_at",
    ]);

    console.log("[import] Copying credit_cards…");
    const cardsRaw = await selectAll(src, "credit_cards");
    const cards = cardsRaw.map((row) => {
      let gap = row.payment_due_gap_days as number | null;
      if (gap == null && srcCardCols.has("payment_due_day")) {
        gap = gapFromBillingAndDueDay(
          row.billing_day as number | null,
          row.payment_due_day as number | null,
        );
      }
      return {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        current_outstanding: row.current_outstanding,
        statement_amount: srcCardCols.has("statement_amount")
          ? row.statement_amount
          : null,
        pin_to_current_statement: srcCardCols.has("pin_to_current_statement")
          ? (row.pin_to_current_statement ?? false)
          : false,
        credit_limit: row.credit_limit,
        shares_limit_with_id: null, // second pass
        billing_day: row.billing_day,
        payment_due_gap_days: gap,
        last_four: row.last_four,
        is_rupay: row.is_rupay ?? false,
        status: row.status,
        created_at: row.created_at,
      };
    });
    const cardInsertCols = [
      "id",
      "user_id",
      "name",
      "current_outstanding",
      "statement_amount",
      "pin_to_current_statement",
      "credit_limit",
      "shares_limit_with_id",
      "billing_day",
      "payment_due_gap_days",
      "last_four",
      "is_rupay",
      "status",
      "created_at",
    ].filter((c) => dstCardCols.has(c));
    await insertRows(dst, "credit_cards", cards, cardInsertCols);

    // Second pass: shared limit FKs
    for (const row of cardsRaw) {
      if (row.shares_limit_with_id == null) continue;
      await dst`
        UPDATE credit_cards
        SET shares_limit_with_id = ${row.shares_limit_with_id as string}
        WHERE id = ${row.id as string}
      `;
    }

    console.log("[import] Copying transactions…");
    const txs = await selectAll(src, "transactions");
    await insertRows(dst, "transactions", txs, [
      "id",
      "user_id",
      "date",
      "occurred_at",
      "description",
      "category_id",
      "type",
      "amount",
      "credit_card_id",
      "bank_account_id",
      "client_id",
      "created_at",
    ]);

    console.log("[import] Copying debt_accounts…");
    const debtsRaw = await selectAll(src, "debt_accounts");
    const debts = debtsRaw.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      type: row.type,
      starting_balance: row.starting_balance,
      monthly_emi: row.monthly_emi,
      interest_percent: row.interest_percent,
      interest_type: srcDebtCols.has("interest_type")
        ? (row.interest_type ?? "fixed")
        : "fixed",
      gst_percent: srcDebtCols.has("gst_percent")
        ? (row.gst_percent ?? "18")
        : "18",
      total_months: row.total_months,
      months_paid: row.months_paid,
      status: row.status,
      credit_card_id: row.credit_card_id,
      received_transaction_id: row.received_transaction_id,
      created_at: row.created_at,
    }));
    await insertRows(dst, "debt_accounts", debts, [
      "id",
      "user_id",
      "name",
      "type",
      "starting_balance",
      "monthly_emi",
      "interest_percent",
      "interest_type",
      "gst_percent",
      "total_months",
      "months_paid",
      "status",
      "credit_card_id",
      "received_transaction_id",
      "created_at",
    ]);

    console.log("[import] Copying debt_payments…");
    const paymentsRaw = await selectAll(src, "debt_payments");
    const payments = paymentsRaw.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      account_id: row.account_id,
      due_date: row.due_date,
      payment_type: row.payment_type,
      amount: row.amount,
      principal_amount: srcPayCols.has("principal_amount")
        ? row.principal_amount
        : null,
      interest_amount: srcPayCols.has("interest_amount")
        ? row.interest_amount
        : null,
      gst_amount: srcPayCols.has("gst_amount") ? row.gst_amount : null,
      is_paid: row.is_paid,
      transaction_id: row.transaction_id,
      created_at: row.created_at,
    }));
    await insertRows(dst, "debt_payments", payments, [
      "id",
      "user_id",
      "account_id",
      "due_date",
      "payment_type",
      "amount",
      "principal_amount",
      "interest_amount",
      "gst_amount",
      "is_paid",
      "transaction_id",
      "created_at",
    ]);

    console.log("[import] Copying card_activities…");
    const activities = await selectAll(src, "card_activities");
    await insertRows(dst, "card_activities", activities, [
      "id",
      "user_id",
      "card_id",
      "date",
      "activity_type",
      "amount",
      "outstanding_delta",
      "wallet_credit",
      "card_charged",
      "bank_fee",
      "description",
      "transaction_id",
      "related_transaction_id",
      "created_at",
    ]);

    console.log("[import] Copying budgets…");
    const budgets = await selectAll(src, "budgets");
    await insertRows(dst, "budgets", budgets, [
      "id",
      "user_id",
      "category_id",
      "year_month",
      "amount",
    ]);

    console.log("[import] Copying savings_goals…");
    const goals = await selectAll(src, "savings_goals");
    await insertRows(dst, "savings_goals", goals, [
      "id",
      "user_id",
      "name",
      "target_amount",
      "current_amount",
      "target_date",
      "created_at",
    ]);

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
    ] as const;

    console.log("\n[import] Row counts (source → target):");
    let mismatch = false;
    for (const t of TABLES) {
      const a = await count(src, t);
      const b = await count(dst, t);
      const ok = a === b ? "OK" : "MISMATCH";
      if (a !== b) mismatch = true;
      console.log(`  ${t}: ${a} → ${b}  ${ok}`);
    }

    if (mismatch) {
      console.error("[import] Count mismatch — inspect before cutover.");
      process.exit(1);
    }
    console.log("[import] Done.");
  } finally {
    await src.end({ timeout: 5 });
    await dst.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
