import { and, eq } from "drizzle-orm";
import { createUserAccount } from "@/lib/bootstrap-user";
import { db } from "@/lib/db";
import { bankAccounts, categories, users } from "@/lib/db/schema";

/** Wipe all app data (FK cascades from users). Safe only on a test database. */
export async function resetDatabase() {
  // DB-level ON DELETE CASCADE clears owned rows. Prefer delete over raw
  // TRUNCATE so the neon-http | postgres-js Db union stays typed.
  await db.delete(users);
}

export type FixtureUser = {
  id: string;
  email: string;
  name: string;
  categoryId: string;
  bankAccountId: string;
};

/**
 * User + default categories + a bank account whose balanceAsOf is in the past
 * so new transactions adjust `currentBalance`.
 */
export async function createFixtureUser(
  label: string,
  opts?: { startingBalance?: string },
): Promise<FixtureUser> {
  const email = `${label.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@example.test`;
  const user = await createUserAccount({
    email,
    name: label,
    password: "test-password-123",
  });

  const [food] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, user.id),
        eq(categories.name, "Food"),
        eq(categories.kind, "expense"),
      ),
    )
    .limit(1);
  if (!food) {
    throw new Error(`Expected default Food category for ${email}`);
  }

  const [bank] = await db
    .insert(bankAccounts)
    .values({
      userId: user.id,
      name: `${label} Checking`,
      currentBalance: opts?.startingBalance ?? "10000.00",
      // Epoch so any realistic occurredAt adjusts the balance.
      balanceAsOf: new Date(0),
      accountType: "Savings",
      status: "Active",
    })
    .returning();

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    categoryId: food.id,
    bankAccountId: bank.id,
  };
}

export async function getBankBalance(
  userId: string,
  bankAccountId: string,
): Promise<string> {
  const [row] = await db
    .select({ currentBalance: bankAccounts.currentBalance })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, bankAccountId),
        eq(bankAccounts.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Bank account not found");
  return row.currentBalance;
}
