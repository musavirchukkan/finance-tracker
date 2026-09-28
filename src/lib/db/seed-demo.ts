/**
 * Local demo dataset — factories for budgets, transactions, and debt.
 * Usage: npm run db:seed:demo
 *
 * Safe for local review: clears this user's demo tables and re-seeds.
 * Does not delete the user account.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { format, addMonths, startOfMonth } from "date-fns";
import {
  budgets,
  categories,
  debtAccounts,
  debtPayments,
  debtSettings,
  transactions,
  users,
} from "./schema";
import {
  buildBudgetRows,
  buildDebtAccounts,
  buildDebtPayments,
  buildMonthTransactions,
  createRng,
  yearMonthOffset,
} from "./factories";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const email = (process.env.SEED_EMAIL ?? "you@example.com").toLowerCase();
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.error(
      `No user for ${email}. Run \`npm run db:seed\` first, then \`npm run db:seed:demo\`.`,
    );
    await client.end();
    process.exit(1);
  }

  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, user.id));

  if (cats.length === 0) {
    console.error("No categories. Run `npm run db:seed` first.");
    await client.end();
    process.exit(1);
  }

  console.log(`Seeding demo data for ${email}…`);

  // Clear existing finance data for a clean review set
  await db.delete(debtPayments).where(eq(debtPayments.userId, user.id));
  await db.delete(debtAccounts).where(eq(debtAccounts.userId, user.id));
  await db.delete(transactions).where(eq(transactions.userId, user.id));
  await db.delete(budgets).where(eq(budgets.userId, user.id));

  const rng = createRng(20260928);
  const expenseCats = cats.filter((c) => c.kind !== "income");
  const catRefs = cats.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
  }));

  // Budgets for current + previous month
  const months = [yearMonthOffset(0), yearMonthOffset(1)];
  for (const ym of months) {
    await db.insert(budgets).values(buildBudgetRows(user.id, expenseCats, ym));
  }

  // Transactions for last 3 months (charts + lists look full)
  const txRows = [0, 1, 2].flatMap((ago) =>
    buildMonthTransactions(user.id, catRefs, yearMonthOffset(ago), rng),
  );
  // Insert in chunks
  const chunk = 80;
  for (let i = 0; i < txRows.length; i += chunk) {
    await db.insert(transactions).values(txRows.slice(i, i + chunk));
  }

  // Debt
  const goal = format(
    addMonths(startOfMonth(new Date()), 19),
    "yyyy-MM-dd",
  );
  const existingSettings = await db
    .select()
    .from(debtSettings)
    .where(eq(debtSettings.userId, user.id))
    .limit(1);
  if (existingSettings[0]) {
    await db
      .update(debtSettings)
      .set({ goalPayoffDate: goal })
      .where(eq(debtSettings.userId, user.id));
  } else {
    await db.insert(debtSettings).values({
      userId: user.id,
      goalPayoffDate: goal,
    });
  }

  const accountDefs = buildDebtAccounts(user.id);
  const insertedAccounts = await db
    .insert(debtAccounts)
    .values(accountDefs)
    .returning();

  const paymentRows = buildDebtPayments(
    user.id,
    insertedAccounts.map((a) => ({ id: a.id, name: a.name })),
    rng,
  );
  await db.insert(debtPayments).values(paymentRows);

  console.log("Demo data ready:");
  console.log(`  budgets:      ${months.length} months × ${expenseCats.length} categories`);
  console.log(`  transactions: ${txRows.length}`);
  console.log(`  debt accounts:${insertedAccounts.length}`);
  console.log(`  debt payments:${paymentRows.length}`);
  console.log(`  login: ${email} / (your SEED_PASSWORD)`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
