/**
 * Clear finance data for the seed user, then seed only:
 * categories, credit cards, bank accounts.
 * No transactions, debt, budgets, goals, or card activities.
 *
 * Usage: npx tsx src/lib/db/seed-base.ts
 * (or npm run db:seed:base)
 */
import "dotenv/config";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { defaultIconForCategoryName } from "../category-icons";
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

const EXPENSE_CATEGORIES = [
  "Auto",
  "Entertainment",
  "Food",
  "Home",
  "Medical",
  "Personal Items",
  "Travel",
  "Utilities",
  "Debt / EMI",
  "Lent",
  "Kuri",
  "Credit Card",
  "Card fees",
  "Bank charges",
  "Other",
];

const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Borrowed",
  "Lent repaid",
  "Kuri payout",
  "Other Income",
];

const SAMPLE_CARDS = [
  {
    name: "HDFC Millennia",
    currentOutstanding: "12500.00",
    creditLimit: "50000.00",
    billingDay: 25,
    paymentDueDay: 10,
    lastFour: "4821",
    isRupay: false,
  },
  {
    name: "Amazon Pay ICICI",
    currentOutstanding: "3200.00",
    creditLimit: "75000.00",
    billingDay: 15,
    paymentDueDay: 5,
    lastFour: "9104",
    isRupay: false,
  },
  {
    name: "SBI RuPay",
    currentOutstanding: "1800.00",
    creditLimit: "40000.00",
    billingDay: 5,
    paymentDueDay: 20,
    lastFour: "3377",
    isRupay: true,
  },
];

const SAMPLE_ACCOUNTS = [
  {
    name: "HDFC Salary",
    currentBalance: "45000.00",
    accountType: "Savings",
  },
  {
    name: "SBI Savings",
    currentBalance: "18250.00",
    accountType: "Savings",
  },
  {
    name: "Cash wallet",
    currentBalance: "2500.00",
    accountType: "Wallet",
  },
];

async function main() {
  const url = getMigrationDatabaseUrl();
  const email = (process.env.SEED_EMAIL ?? "you@example.com").toLowerCase();
  const password = process.env.SEED_PASSWORD ?? "changeme123";
  const name = process.env.SEED_NAME ?? "Musavir";

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    const passwordHash = await hash(password, 12);
    [user] = await db
      .insert(users)
      .values({ email, name, passwordHash })
      .returning();
    console.log(`Created user ${email}`);
  } else {
    console.log(`Using existing user ${email}`);
  }

  console.log("Clearing finance tables…");
  // Order respects FKs
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

  console.log("Seeding categories…");
  await db.insert(categories).values([
    ...EXPENSE_CATEGORIES.map((catName, index) => ({
      userId: user.id,
      name: catName,
      kind: "expense" as const,
      icon: defaultIconForCategoryName(catName),
      sortOrder: index,
    })),
    ...INCOME_CATEGORIES.map((catName, index) => ({
      userId: user.id,
      name: catName,
      kind: "income" as const,
      icon: defaultIconForCategoryName(catName),
      sortOrder: 100 + index,
    })),
  ]);

  console.log("Seeding credit cards…");
  await db.insert(creditCards).values(
    SAMPLE_CARDS.map((c) => ({
      userId: user.id,
      name: c.name,
      currentOutstanding: c.currentOutstanding,
      creditLimit: c.creditLimit,
      billingDay: c.billingDay,
      paymentDueDay: c.paymentDueDay,
      lastFour: c.lastFour,
      isRupay: c.isRupay,
      status: "Active",
    })),
  );

  console.log("Seeding bank accounts…");
  await db.insert(bankAccounts).values(
    SAMPLE_ACCOUNTS.map((a) => ({
      userId: user.id,
      name: a.name,
      currentBalance: a.currentBalance,
      accountType: a.accountType,
      status: "Active",
    })),
  );

  console.log("Done.");
  console.log(`  categories: ${EXPENSE_CATEGORIES.length + INCOME_CATEGORIES.length}`);
  console.log(`  cards:      ${SAMPLE_CARDS.length}`);
  console.log(`  accounts:   ${SAMPLE_ACCOUNTS.length}`);
  console.log(`  login:      ${email} / ${password}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
