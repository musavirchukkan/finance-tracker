import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, debtAccounts, debtPayments, transactions } from "@/lib/db/schema";
import { PAID_TO_DATE_TYPE } from "@/lib/debt-account";
import { defaultIconForCategoryName } from "@/lib/category-icons";
import {
  isBorrowedType,
  isCreditCardType,
  isKuriType,
  isLentType,
  paymentBalanceEffect,
} from "@/lib/debt-kinds";

export const DEBT_EMI_CATEGORY = "Debt / EMI";
export const BORROWED_CATEGORY = "Borrowed";
export const LENT_CATEGORY = "Lent";
export const LENT_REPAID_CATEGORY = "Lent repaid";
export const KURI_CATEGORY = "Kuri";
export const KURI_PAYOUT_CATEGORY = "Kuri payout";
export const CREDIT_CARD_CATEGORY = "Credit Card";
export const WALLET_CASHOUT_CATEGORY = "Wallet cashout";

export { isBorrowedType, isLentType, isKuriType, isCreditCardType };

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
    byName.set(name.toLowerCase(), row);
    return row;
  }

  const debtEmi = await ensure(DEBT_EMI_CATEGORY, "expense", 50);
  const lent = await ensure(LENT_CATEGORY, "expense", 51);
  const kuri = await ensure(KURI_CATEGORY, "expense", 52);
  const creditCard = await ensure(CREDIT_CARD_CATEGORY, "expense", 53);
  const borrowed = await ensure(BORROWED_CATEGORY, "income", 110);
  const lentRepaid = await ensure(LENT_REPAID_CATEGORY, "income", 111);
  const kuriPayout = await ensure(KURI_PAYOUT_CATEGORY, "income", 112);
  const walletCashout = await ensure(WALLET_CASHOUT_CATEGORY, "income", 113);

  return {
    debtEmiCategoryId: debtEmi.id,
    lentCategoryId: lent.id,
    kuriCategoryId: kuri.id,
    creditCardCategoryId: creditCard.id,
    borrowedCategoryId: borrowed.id,
    lentRepaidCategoryId: lentRepaid.id,
    kuriPayoutCategoryId: kuriPayout.id,
    walletCashoutCategoryId: walletCashout.id,
  };
}

function resolvePaymentCashflow(args: {
  accountType: string;
  accountName: string;
  paymentType: string;
  cats: Awaited<ReturnType<typeof ensureDebtCashflowCategories>>;
}): { categoryId: string; txType: "income" | "expense"; description: string } | null {
  const effect = paymentBalanceEffect(args.paymentType);
  const payType = args.paymentType.trim();
  const payLower = payType.toLowerCase();

  // Charges increase CC debt but do not move bank cash yet.
  if (effect === "charge") {
    return null;
  }

  if (payLower === "kuri payout" || (isKuriType(args.accountType) && effect === "payout")) {
    return {
      categoryId: args.cats.kuriPayoutCategoryId,
      txType: "income",
      description: `Kuri payout — ${args.accountName}`,
    };
  }

  if (payLower === "wallet → bank" || payLower === "wallet -> bank") {
    return {
      categoryId: args.cats.walletCashoutCategoryId,
      txType: "income",
      description: `Wallet → bank — ${args.accountName}`,
    };
  }

  if (isLentType(args.accountType)) {
    return {
      categoryId: args.cats.lentRepaidCategoryId,
      txType: "income",
      description: `Repayment — ${args.accountName}`,
    };
  }

  if (isKuriType(args.accountType)) {
    return {
      categoryId: args.cats.kuriCategoryId,
      txType: "expense",
      description: `${payType || "Contribution"} — ${args.accountName}`,
    };
  }

  if (isCreditCardType(args.accountType)) {
    return {
      categoryId: args.cats.creditCardCategoryId,
      txType: "expense",
      description: `${payType || "Bill payment"} — ${args.accountName}`,
    };
  }

  return {
    categoryId: args.cats.debtEmiCategoryId,
    txType: "expense",
    description: `${payType || "EMI"} — ${args.accountName}`,
  };
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
      accountType: debtAccounts.type,
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

  async function clearLinkedTx() {
    if (!payment.transactionId) return;
    const txId = payment.transactionId;
    await db
      .update(debtPayments)
      .set({ transactionId: null })
      .where(and(eq(debtPayments.id, payment.id), eq(debtPayments.userId, userId)));
    await db
      .delete(transactions)
      .where(and(eq(transactions.id, txId), eq(transactions.userId, userId)));
  }

  if (!payment.isPaid) {
    await clearLinkedTx();
    return;
  }

  const cats = await ensureDebtCashflowCategories(userId);
  const resolved = resolvePaymentCashflow({
    accountType: payment.accountType,
    accountName: payment.accountName,
    paymentType: payment.paymentType,
    cats,
  });

  // e.g. Wallet recharge: debt up, no bank transaction yet.
  if (!resolved) {
    await clearLinkedTx();
    return;
  }

  const { categoryId, txType, description } = resolved;
  const amount = payment.amount;

  if (payment.transactionId) {
    await db
      .update(transactions)
      .set({
        date: payment.dueDate,
        occurredAt: new Date(`${payment.dueDate}T12:00:00`),
        description,
        categoryId,
        type: txType,
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
      categoryId,
      type: txType,
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

/** Opening cashflow when you receive borrowed money. */
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

/** Opening cashflow when you lend money to someone. */
export async function createLentExpenseTransaction(args: {
  userId: string;
  accountName: string;
  amount: string;
  date: string;
}) {
  const { lentCategoryId } = await ensureDebtCashflowCategories(args.userId);
  const [tx] = await db
    .insert(transactions)
    .values({
      userId: args.userId,
      date: args.date,
      occurredAt: new Date(`${args.date}T12:00:00`),
      description: `Lent — ${args.accountName}`,
      categoryId: lentCategoryId,
      type: "expense",
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
