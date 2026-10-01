import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, debtAccounts, debtPayments, transactions } from "@/lib/db/schema";
import { PAID_TO_DATE_TYPE } from "@/lib/debt-account";
import { defaultIconForCategoryName } from "@/lib/category-icons";

export const DEBT_EMI_CATEGORY = "Debt / EMI";
export const BORROWED_CATEGORY = "Borrowed";

export async function ensureDebtCashflowCategories(userId: string) {
  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));

  async function ensure(name: string, kind: "expense" | "income", sortOrder: number) {
    const found = byName.get(name.toLowerCase());
    if (found) return found;
    const [row] = await db
      .insert(categories)
      .values({
        userId,
        name,
        kind,
        icon: defaultIconForCategoryName(name),
        sortOrder,
      })
      .returning();
    return row;
  }

  const expense = await ensure(DEBT_EMI_CATEGORY, "expense", 50);
  const income = await ensure(BORROWED_CATEGORY, "income", 110);
  return { debtEmiCategoryId: expense.id, borrowedCategoryId: income.id };
}

export async function syncDebtPaymentTransaction(paymentId: string, userId: string) {
  const [payment] = await db
    .select({
      id: debtPayments.id,
      userId: debtPayments.userId,
      accountId: debtPayments.accountId,
      dueDate: debtPayments.dueDate,
      paymentType: debtPayments.paymentType,
      amount: debtPayments.amount,
      isPaid: debtPayments.isPaid,
      transactionId: debtPayments.transactionId,
      accountName: debtAccounts.name,
    })
    .from(debtPayments)
    .innerJoin(debtAccounts, eq(debtPayments.accountId, debtAccounts.id))
    .where(and(eq(debtPayments.id, paymentId), eq(debtPayments.userId, userId)))
    .limit(1);

  if (!payment) return;

  // Historical backfill must not hit this month's cashflow.
  if (payment.paymentType === PAID_TO_DATE_TYPE) {
    if (payment.transactionId) {
      await db
        .update(debtPayments)
        .set({ transactionId: null })
        .where(and(eq(debtPayments.id, payment.id), eq(debtPayments.userId, userId)));
      await db
        .delete(transactions)
        .where(
          and(eq(transactions.id, payment.transactionId), eq(transactions.userId, userId)),
        );
    }
    return;
  }

  if (!payment.isPaid) {
    if (payment.transactionId) {
      const txId = payment.transactionId;
      await db
        .update(debtPayments)
        .set({ transactionId: null })
        .where(and(eq(debtPayments.id, payment.id), eq(debtPayments.userId, userId)));
      await db
        .delete(transactions)
        .where(and(eq(transactions.id, txId), eq(transactions.userId, userId)));
    }
    return;
  }

  const { debtEmiCategoryId } = await ensureDebtCashflowCategories(userId);
  const description = `${payment.paymentType || "EMI"} — ${payment.accountName}`;
  const amount = payment.amount;

  if (payment.transactionId) {
    await db
      .update(transactions)
      .set({
        date: payment.dueDate,
        occurredAt: new Date(`${payment.dueDate}T12:00:00`),
        description,
        categoryId: debtEmiCategoryId,
        type: "expense",
        amount,
      })
      .where(
        and(
          eq(transactions.id, payment.transactionId),
          eq(transactions.userId, userId),
        ),
      );
    return;
  }

  const [tx] = await db
    .insert(transactions)
    .values({
      userId,
      date: payment.dueDate,
      occurredAt: new Date(`${payment.dueDate}T12:00:00`),
      description,
      categoryId: debtEmiCategoryId,
      type: "expense",
      amount,
    })
    .returning();

  if (tx) {
    await db
      .update(debtPayments)
      .set({ transactionId: tx.id })
      .where(and(eq(debtPayments.id, payment.id), eq(debtPayments.userId, userId)));
  }
}

export async function deleteLinkedDebtPaymentTransaction(
  paymentId: string,
  userId: string,
) {
  const [payment] = await db
    .select({
      id: debtPayments.id,
      transactionId: debtPayments.transactionId,
    })
    .from(debtPayments)
    .where(and(eq(debtPayments.id, paymentId), eq(debtPayments.userId, userId)))
    .limit(1);

  if (!payment?.transactionId) return;

  const txId = payment.transactionId;
  await db
    .update(debtPayments)
    .set({ transactionId: null })
    .where(and(eq(debtPayments.id, payment.id), eq(debtPayments.userId, userId)));
  await db
    .delete(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.userId, userId)));
}

export async function createBorrowedIncomeTransaction(args: {
  userId: string;
  accountName: string;
  amount: string;
  date: string;
}) {
  const { borrowedCategoryId } = await ensureDebtCashflowCategories(args.userId);
  const [tx] = await db
    .insert(transactions)
    .values({
      userId: args.userId,
      date: args.date,
      occurredAt: new Date(`${args.date}T12:00:00`),
      description: `Borrowed — ${args.accountName}`,
      categoryId: borrowedCategoryId,
      type: "income",
      amount: args.amount,
    })
    .returning();
  return tx?.id ?? null;
}

export async function deleteReceivedIncomeTransaction(
  userId: string,
  transactionId: string | null | undefined,
) {
  if (!transactionId) return;
  await db
    .delete(transactions)
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
    );
}
