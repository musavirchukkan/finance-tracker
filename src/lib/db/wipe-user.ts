/**
 * Clear all finance data for SEED_EMAIL. Keeps the login user.
 * Does not insert categories, cards, or accounts.
 *
 * Usage (point DATABASE_MIGRATION_URL at the target DB first):
 *   npm run db:wipe
 *
 * After wipe, optionally run `npm run db:seed` to restore default
 * categories only (still no sample cards/accounts).
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getMigrationDatabaseUrl } from "./env";
import {
  bankAccounts,
  budgets,
  cardActivities,
  categories,
  creditCards,
  debtAccounts,
  debtPayments,
  debtSettings,
  savingsGoals,
  transactions,
  users,
} from "./schema";

async function main() {
  const url = getMigrationDatabaseUrl();
  const email = (process.env.SEED_EMAIL ?? "you@example.com").toLowerCase();

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.error(`No user for ${email}. Nothing to wipe.`);
    await client.end();
    process.exit(1);
  }

  console.log(`Wiping finance data for ${email}…`);
  await db.delete(debtPayments).where(eq(debtPayments.userId, user.id));
  await db.delete(debtAccounts).where(eq(debtAccounts.userId, user.id));
  await db.delete(cardActivities).where(eq(cardActivities.userId, user.id));
  await db.delete(transactions).where(eq(transactions.userId, user.id));
  await db.delete(budgets).where(eq(budgets.userId, user.id));
  await db.delete(savingsGoals).where(eq(savingsGoals.userId, user.id));
  await db.delete(debtSettings).where(eq(debtSettings.userId, user.id));
  await db.delete(bankAccounts).where(eq(bankAccounts.userId, user.id));
  await db.delete(creditCards).where(eq(creditCards.userId, user.id));
  await db.delete(categories).where(eq(categories.userId, user.id));

  console.log("Done. Login still works; no cards, accounts, or categories.");
  console.log("Optional: npm run db:seed  → default categories only.");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
