"use server";

import { compare, hash } from "bcryptjs";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
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
} from "@/lib/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { parseAmount, toNumber } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { monthDateBounds, yearMonthFromDate } from "@/lib/months";
import {
  DEFAULT_GST_ON_INTEREST_PERCENT,
  PAID_TO_DATE_TYPE,
  computeGstOnInterest,
  computeMonthlyInterest,
  computeTotalInterest,
  normalizeInterestType,
  suggestInstallmentSplit,
  validateDebtTenure,
} from "@/lib/debt-account";
import { isBudgetableCategoryName } from "@/lib/budget-categories";
import {
  createBorrowedIncomeTransaction,
  createLentExpenseTransaction,
  deleteLinkedDebtPaymentTransaction,
  deleteReceivedIncomeTransaction,
  isBorrowedType,
  isLentType,
  syncDebtPaymentTransaction,
} from "@/lib/debt-cashflow";
import { formatCardLabel } from "@/lib/credit-cards";
import {
  computeOutstanding,
  isCreditCardEmiType,
  paymentBalanceEffect,
} from "@/lib/debt-kinds";
import {
  applyLinkedEmiForCycle,
  emiApplyModeFromChoice,
  parseEmiOutstandingChoice,
} from "@/lib/emi-statement-post";

function parsePaymentSource(formData: FormData, type: "expense" | "income") {
  const creditCardId =
    type === "expense"
      ? String(formData.get("creditCardId") ?? "").trim() || null
      : null;
  const cardBillPayId =
    type === "expense"
      ? String(formData.get("cardBillPayId") ?? "").trim() || null
      : null;
  let bankAccountId =
    String(formData.get("bankAccountId") ?? "").trim() || null;
  // Card spend is charged on the card — not paid from a bank account.
  // Bill pay can (and usually does) debit a bank / UPI account.
  if (creditCardId) bankAccountId = null;
  return { creditCardId, cardBillPayId, bankAccountId };
}

export async function createTransaction(formData: FormData) {
  const user = await requireUser();
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const type = String(formData.get("type") ?? "expense") === "income"
    ? "income"
    : "expense";
  const amount = parseAmount(String(formData.get("amount") ?? "0"));
  const { creditCardId, cardBillPayId, bankAccountId } = parsePaymentSource(
    formData,
    type,
  );

  if (!date || !categoryId) {
    throw new Error("Missing required fields");
  }

  const result = await insertTransactionForUser(user.id, {
    date,
    description,
    categoryId,
    type,
    amount,
    creditCardId,
    cardBillPayId,
    bankAccountId,
  });

  if (!result.duplicate) {
    revalidatePath("/transactions");
    revalidatePath("/budget");
    revalidatePath("/overview");
    revalidatePath("/analytics");
    revalidatePath("/goals");
    revalidatePath("/quick-add");
    revalidatePath("/cards");
    revalidatePath("/accounts");
    if (creditCardId) revalidatePath(`/cards/${creditCardId}`);
    if (cardBillPayId) revalidatePath(`/cards/${cardBillPayId}`);
    if (bankAccountId) revalidatePath(`/accounts/${bankAccountId}`);
  }
}

export async function updateTransaction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const type = String(formData.get("type") ?? "expense") === "income"
    ? "income"
    : "expense";
  const amount = parseAmount(String(formData.get("amount") ?? "0"));
  const { creditCardId, cardBillPayId, bankAccountId } = parsePaymentSource(
    formData,
    type,
  );

  const {
    reverseActivitiesForTransaction,
    recordSpendOnCard,
    recordBillPaymentOnCard,
  } = await import("@/lib/credit-card-cashflow");
  const {
    reverseBankBalanceForTransaction,
    applyBankBalanceForTransaction,
  } = await import("@/lib/bank-account-cashflow");

  await reverseBankBalanceForTransaction(user.id, id);
  await reverseActivitiesForTransaction(user.id, id);

  await db
    .update(transactions)
    .set({
      date,
      description,
      categoryId,
      type,
      amount: amount.toFixed(2),
      creditCardId,
      bankAccountId,
    })
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));

  if (type === "expense" && creditCardId && amount > 0) {
    await recordSpendOnCard({
      userId: user.id,
      cardId: creditCardId,
      date,
      amount,
      description,
      transactionId: id,
    });
  } else if (type === "expense" && cardBillPayId && amount > 0) {
    await recordBillPaymentOnCard({
      userId: user.id,
      cardId: cardBillPayId,
      date,
      amount,
      description: description || `Bill payment`,
      transactionId: id,
    });
  }

  await applyBankBalanceForTransaction({
    userId: user.id,
    bankAccountId,
    type,
    amount,
  });

  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/goals");
  revalidatePath("/cards");
  revalidatePath("/accounts");
  if (creditCardId) revalidatePath(`/cards/${creditCardId}`);
  if (cardBillPayId) revalidatePath(`/cards/${cardBillPayId}`);
  if (bankAccountId) revalidatePath(`/accounts/${bankAccountId}`);
}

export async function deleteTransaction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const { reverseActivitiesForTransaction } = await import(
    "@/lib/credit-card-cashflow"
  );
  const { reverseBankBalanceForTransaction } = await import(
    "@/lib/bank-account-cashflow"
  );
  await reverseBankBalanceForTransaction(user.id, id);
  await reverseActivitiesForTransaction(user.id, id);

  await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));

  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/goals");
  revalidatePath("/cards");
  revalidatePath("/accounts");
}

export async function upsertBudgetAmount(formData: FormData) {
  const user = await requireUser();
  const categoryId = String(formData.get("categoryId") ?? "");
  const yearMonth = String(formData.get("yearMonth") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "0"));

  const [cat] = await db
    .select()
    .from(categories)
    .where(
      and(eq(categories.id, categoryId), eq(categories.userId, user.id)),
    )
    .limit(1);
  if (!cat || cat.kind !== "expense" || !isBudgetableCategoryName(cat.name)) {
    throw new Error("This category cannot have a budget");
  }

  const existing = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, user.id),
        eq(budgets.categoryId, categoryId),
        eq(budgets.yearMonth, yearMonth),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(budgets)
      .set({ amount: amount.toFixed(2) })
      .where(eq(budgets.id, existing[0].id));
  } else {
    await db.insert(budgets).values({
      userId: user.id,
      categoryId,
      yearMonth,
      amount: amount.toFixed(2),
    });
  }

  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
}

function revalidateDebtCashflow(
  accountId?: string,
  creditCardId?: string | null,
) {
  revalidatePath("/debt");
  if (accountId) revalidatePath(`/debt/${accountId}`);
  revalidatePath("/goals");
  revalidatePath("/overview");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/quick-add");
  revalidatePath("/cards");
  if (creditCardId) revalidatePath(`/cards/${creditCardId}`);
}

function parseDebtCreditCardId(type: string, formData: FormData): string | null {
  if (!isCreditCardEmiType(type)) return null;
  const creditCardId = String(formData.get("creditCardId") ?? "").trim();
  if (!creditCardId) {
    throw new Error("Choose a credit card for Credit Card EMI");
  }
  return creditCardId;
}

export async function createDebtAccount(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const startingBalance = parseAmount(
    String(formData.get("startingBalance") ?? "0"),
  );
  const monthlyEmi = parseAmount(String(formData.get("monthlyEmi") ?? "0"));
  const interestPercent = Math.max(
    0,
    parseAmount(String(formData.get("interestPercent") ?? "0")),
  );
  const interestType = normalizeInterestType(
    String(formData.get("interestType") ?? "fixed"),
  );
  const gstRaw = String(formData.get("gstPercent") ?? "").trim();
  const gstPercent = Math.max(
    0,
    gstRaw === ""
      ? DEFAULT_GST_ON_INTEREST_PERCENT
      : parseAmount(gstRaw),
  );
  const totalMonths = Math.max(
    0,
    Math.floor(Number(formData.get("totalMonths") ?? 0) || 0),
  );
  const monthsPaid = Math.max(
    0,
    Math.floor(Number(formData.get("monthsPaid") ?? 0) || 0),
  );
  const paidTillNow = parseAmount(String(formData.get("paidTillNow") ?? "0"));
  const status = String(formData.get("status") ?? "Active Paydown").trim();
  const logOpeningCashflow =
    formData.get("logAsIncome") === "on" ||
    formData.get("logAsIncome") === "true" ||
    formData.get("logOpeningCashflow") === "on" ||
    formData.get("logOpeningCashflow") === "true";

  if (!name || !type) throw new Error("Name and type are required");
  const creditCardId = parseDebtCreditCardId(type, formData);

  validateDebtTenure({
    startingBalance,
    monthlyEmi,
    totalMonths,
    monthsPaid,
    paidTillNow,
  });

  let receivedTransactionId: string | null = null;
  const today = new Date().toISOString().slice(0, 10);
  if (logOpeningCashflow && startingBalance > 0) {
    if (isLentType(type)) {
      receivedTransactionId = await createLentExpenseTransaction({
        userId: user.id,
        accountName: name,
        amount: startingBalance.toFixed(2),
        date: today,
      });
    } else if (isBorrowedType(type)) {
      receivedTransactionId = await createBorrowedIncomeTransaction({
        userId: user.id,
        accountName: name,
        amount: startingBalance.toFixed(2),
        date: today,
      });
    }
  }

  const [account] = await db
    .insert(debtAccounts)
    .values({
      userId: user.id,
      name,
      type,
      startingBalance: startingBalance.toFixed(2),
      monthlyEmi: monthlyEmi.toFixed(2),
      interestPercent: interestPercent.toFixed(2),
      interestType,
      gstPercent: gstPercent.toFixed(2),
      totalMonths,
      monthsPaid,
      status,
      creditCardId,
      receivedTransactionId,
    })
    .returning();

  if (account && paidTillNow > 0) {
    await db.insert(debtPayments).values({
      userId: user.id,
      accountId: account.id,
      dueDate: today,
      paymentType: PAID_TO_DATE_TYPE,
      amount: paidTillNow.toFixed(2),
      principalAmount: paidTillNow.toFixed(2),
      interestAmount: "0",
      gstAmount: "0",
      isPaid: true,
    });
  }

  if (account && creditCardId) {
    const emiMode = emiApplyModeFromChoice(
      parseEmiOutstandingChoice(formData.get("emiOutstandingChoice")),
    );
    if (emiMode) {
      await applyLinkedEmiForCycle({
        userId: user.id,
        debtId: account.id,
        mode: emiMode,
      });
    }
  }

  revalidateDebtCashflow(account?.id, creditCardId);
}

async function upsertPaidToDatePayment(args: {
  userId: string;
  accountId: string;
  paidTillNow: number;
}) {
  const { userId, accountId, paidTillNow } = args;
  const [existing] = await db
    .select({ id: debtPayments.id })
    .from(debtPayments)
    .where(
      and(
        eq(debtPayments.userId, userId),
        eq(debtPayments.accountId, accountId),
        eq(debtPayments.paymentType, PAID_TO_DATE_TYPE),
      ),
    )
    .limit(1);

  if (paidTillNow <= 0) {
    if (existing) {
      await deleteLinkedDebtPaymentTransaction(existing.id, userId);
      await db
        .delete(debtPayments)
        .where(
          and(eq(debtPayments.id, existing.id), eq(debtPayments.userId, userId)),
        );
    }
    return;
  }

  if (existing) {
    await db
      .update(debtPayments)
      .set({
        amount: paidTillNow.toFixed(2),
        principalAmount: paidTillNow.toFixed(2),
        interestAmount: "0",
        gstAmount: "0",
        isPaid: true,
      })
      .where(
        and(eq(debtPayments.id, existing.id), eq(debtPayments.userId, userId)),
      );
    await syncDebtPaymentTransaction(existing.id, userId);
    return;
  }

  const [row] = await db
    .insert(debtPayments)
    .values({
      userId,
      accountId,
      dueDate: new Date().toISOString().slice(0, 10),
      paymentType: PAID_TO_DATE_TYPE,
      amount: paidTillNow.toFixed(2),
      principalAmount: paidTillNow.toFixed(2),
      interestAmount: "0",
      gstAmount: "0",
      isPaid: true,
    })
    .returning();
  if (row) await syncDebtPaymentTransaction(row.id, userId);
}

export async function updateDebtAccount(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const startingBalance = parseAmount(
    String(formData.get("startingBalance") ?? "0"),
  );
  const monthlyEmi = parseAmount(String(formData.get("monthlyEmi") ?? "0"));
  const interestPercent = Math.max(
    0,
    parseAmount(String(formData.get("interestPercent") ?? "0")),
  );
  const interestType = normalizeInterestType(
    String(formData.get("interestType") ?? "fixed"),
  );
  const gstRaw = String(formData.get("gstPercent") ?? "").trim();
  const gstPercent = Math.max(
    0,
    gstRaw === ""
      ? DEFAULT_GST_ON_INTEREST_PERCENT
      : parseAmount(gstRaw),
  );
  const totalMonths = Math.max(
    0,
    Math.floor(Number(formData.get("totalMonths") ?? 0) || 0),
  );
  const monthsPaid = Math.max(
    0,
    Math.floor(Number(formData.get("monthsPaid") ?? 0) || 0),
  );
  const paidTillNow = parseAmount(String(formData.get("paidTillNow") ?? "0"));
  const status = String(formData.get("status") ?? "Active Paydown").trim();

  if (!id || !name || !type) throw new Error("Missing fields");
  const creditCardId = parseDebtCreditCardId(type, formData);

  const [prev] = await db
    .select({ creditCardId: debtAccounts.creditCardId })
    .from(debtAccounts)
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, user.id)))
    .limit(1);

  validateDebtTenure({
    startingBalance,
    monthlyEmi,
    totalMonths,
    monthsPaid,
    paidTillNow,
  });

  await db
    .update(debtAccounts)
    .set({
      name,
      type,
      startingBalance: startingBalance.toFixed(2),
      monthlyEmi: monthlyEmi.toFixed(2),
      interestPercent: interestPercent.toFixed(2),
      interestType,
      gstPercent: gstPercent.toFixed(2),
      totalMonths,
      monthsPaid,
      status,
      creditCardId,
    })
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, user.id)));

  await upsertPaidToDatePayment({
    userId: user.id,
    accountId: id,
    paidTillNow,
  });

  if (creditCardId) {
    const emiMode = emiApplyModeFromChoice(
      parseEmiOutstandingChoice(formData.get("emiOutstandingChoice")),
    );
    if (emiMode) {
      await applyLinkedEmiForCycle({
        userId: user.id,
        debtId: id,
        mode: emiMode,
      });
    }
  }

  revalidateDebtCashflow(id, creditCardId);
  if (prev?.creditCardId && prev.creditCardId !== creditCardId) {
    revalidatePath(`/cards/${prev.creditCardId}`);
  }
}

export async function deleteDebtAccount(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const [account] = await db
    .select({
      id: debtAccounts.id,
      receivedTransactionId: debtAccounts.receivedTransactionId,
      creditCardId: debtAccounts.creditCardId,
    })
    .from(debtAccounts)
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, user.id)))
    .limit(1);

  if (!account) return;

  const linkedPayments = await db
    .select({ id: debtPayments.id, transactionId: debtPayments.transactionId })
    .from(debtPayments)
    .where(
      and(eq(debtPayments.accountId, id), eq(debtPayments.userId, user.id)),
    );

  for (const p of linkedPayments) {
    await deleteLinkedDebtPaymentTransaction(p.id, user.id);
  }

  await db
    .update(debtAccounts)
    .set({ receivedTransactionId: null })
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, user.id)));

  await deleteReceivedIncomeTransaction(user.id, account.receivedTransactionId);

  await db
    .delete(debtAccounts)
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, user.id)));

  revalidateDebtCashflow(id, account.creditCardId);
}

async function creditCardIdForDebtAccount(
  userId: string,
  accountId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ creditCardId: debtAccounts.creditCardId })
    .from(debtAccounts)
    .where(
      and(eq(debtAccounts.id, accountId), eq(debtAccounts.userId, userId)),
    )
    .limit(1);
  return row?.creditCardId ?? null;
}

function parseOptionalAmount(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return parseAmount(s);
}

export async function createDebtPayment(formData: FormData) {
  const user = await requireUser();
  const accountId = String(formData.get("accountId") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const paymentType = String(formData.get("paymentType") ?? "EMI").trim();
  const isPaid =
    formData.get("isPaid") === "on" || formData.get("isPaid") === "true";

  if (!accountId || !dueDate) throw new Error("Missing fields");

  const principalAmount = parseOptionalAmount(formData.get("principalAmount"));
  const interestAmount = parseOptionalAmount(formData.get("interestAmount"));
  const gstAmount = parseOptionalAmount(formData.get("gstAmount"));
  const hasSplit =
    principalAmount != null || interestAmount != null || gstAmount != null;
  const splitTotal =
    (principalAmount ?? 0) + (interestAmount ?? 0) + (gstAmount ?? 0);
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = hasSplit
    ? Math.round(splitTotal * 100) / 100
    : parseAmount(amountRaw || "0");
  if (amount <= 0) throw new Error("Enter payment amount");

  const [payment] = await db
    .insert(debtPayments)
    .values({
      userId: user.id,
      accountId,
      dueDate,
      paymentType,
      amount: amount.toFixed(2),
      principalAmount:
        principalAmount != null ? principalAmount.toFixed(2) : null,
      interestAmount: interestAmount != null ? interestAmount.toFixed(2) : null,
      gstAmount: gstAmount != null ? gstAmount.toFixed(2) : null,
      isPaid,
    })
    .returning();

  if (payment) {
    await syncDebtPaymentTransaction(payment.id, user.id);
  }

  const cardId = await creditCardIdForDebtAccount(user.id, accountId);
  revalidateDebtCashflow(accountId, cardId);
}

export async function toggleDebtPaymentPaid(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const isPaid = formData.get("isPaid") === "true";

  const [existing] = await db
    .select({ accountId: debtPayments.accountId })
    .from(debtPayments)
    .where(and(eq(debtPayments.id, id), eq(debtPayments.userId, user.id)))
    .limit(1);

  await db
    .update(debtPayments)
    .set({ isPaid: !isPaid })
    .where(and(eq(debtPayments.id, id), eq(debtPayments.userId, user.id)));

  await syncDebtPaymentTransaction(id, user.id);

  const cardId = existing?.accountId
    ? await creditCardIdForDebtAccount(user.id, existing.accountId)
    : null;
  revalidateDebtCashflow(existing?.accountId, cardId);
}

export async function deleteDebtPayment(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const [existing] = await db
    .select({ accountId: debtPayments.accountId })
    .from(debtPayments)
    .where(and(eq(debtPayments.id, id), eq(debtPayments.userId, user.id)))
    .limit(1);

  await deleteLinkedDebtPaymentTransaction(id, user.id);

  await db
    .delete(debtPayments)
    .where(and(eq(debtPayments.id, id), eq(debtPayments.userId, user.id)));

  const cardId = existing?.accountId
    ? await creditCardIdForDebtAccount(user.id, existing.accountId)
    : null;
  revalidateDebtCashflow(existing?.accountId, cardId);
}

export async function updateDebtGoal(formData: FormData) {
  const user = await requireUser();
  const goalPayoffDate = String(formData.get("goalPayoffDate") ?? "");

  const existing = await db
    .select()
    .from(debtSettings)
    .where(eq(debtSettings.userId, user.id))
    .limit(1);

  if (existing[0]) {
    await db
      .update(debtSettings)
      .set({ goalPayoffDate })
      .where(eq(debtSettings.userId, user.id));
  } else {
    await db.insert(debtSettings).values({
      userId: user.id,
      goalPayoffDate,
    });
  }

  revalidatePath("/debt");
  revalidatePath("/goals");
  revalidatePath("/overview");
  revalidatePath("/settings");
}

export async function createCategory(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") === "income"
    ? "income"
    : "expense";
  const iconRaw = String(formData.get("icon") ?? "").trim();
  const icon = iconRaw || null;
  if (!name) throw new Error("Name required");

  const max = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(eq(categories.userId, user.id))
    .orderBy(desc(categories.sortOrder))
    .limit(1);

  await db.insert(categories).values({
    userId: user.id,
    name,
    kind,
    icon,
    sortOrder: (max[0]?.sortOrder ?? -1) + 1,
  });

  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
}

export async function updateCategory(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") === "income"
    ? "income"
    : "expense";
  const iconRaw = String(formData.get("icon") ?? "").trim();
  const icon = iconRaw || null;

  if (!id || !name) throw new Error("Missing fields");

  await db
    .update(categories)
    .set({ name, kind, icon })
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));

  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
}

export async function deleteCategory(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));

  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
}

export async function getBudgetSummary(userId: string, yearMonth: string) {
  const cats = await db
    .select()
    .from(categories)
    .where(
      and(eq(categories.userId, userId), eq(categories.kind, "expense")),
    )
    .orderBy(asc(categories.sortOrder));

  const budgetRows = await db
    .select()
    .from(budgets)
    .where(
      and(eq(budgets.userId, userId), eq(budgets.yearMonth, yearMonth)),
    );

  const { start: monthStart, end: monthEnd } = monthDateBounds(yearMonth);
  const actualRows = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd),
      ),
    )
    .groupBy(transactions.categoryId);

  const budgetMap = new Map(
    budgetRows.map((b) => [b.categoryId, toNumber(b.amount)]),
  );
  const actualMap = new Map(
    actualRows.map((a) => [a.categoryId, toNumber(a.total)]),
  );

  const rows = cats
    .filter((c) => isBudgetableCategoryName(c.name))
    .map((c) => {
      const budget = budgetMap.get(c.id) ?? 0;
      const actual = actualMap.get(c.id) ?? 0;
      return {
        categoryId: c.id,
        category: c.name,
        budget,
        actual,
        difference: budget - actual,
      };
    });

  const totals = rows.reduce(
    (acc, r) => ({
      budget: acc.budget + r.budget,
      actual: acc.actual + r.actual,
      difference: acc.difference + r.difference,
    }),
    { budget: 0, actual: 0, difference: 0 },
  );

  const cashflowRows = await db
    .select({
      type: transactions.type,
      total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd),
      ),
    )
    .groupBy(transactions.type);

  let income = 0;
  let expense = 0;
  for (const row of cashflowRows) {
    if (row.type === "income") income = toNumber(row.total);
    else expense = toNumber(row.total);
  }

  const incomeByCategory = await db
    .select({
      category: categories.name,
      total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "income"),
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd),
      ),
    )
    .groupBy(categories.name);

  return {
    rows,
    totals,
    cashflow: {
      income,
      expense,
      remaining: income - expense,
      incomeBreakdown: incomeByCategory.map((r) => ({
        name: r.category,
        value: toNumber(r.total),
      })),
    },
  };
}

export async function listTransactions(
  userId: string,
  yearMonth?: string,
  opts?: {
    type?: "income" | "expense" | "all";
    categoryId?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const conditions = [eq(transactions.userId, userId)];
  if (yearMonth) {
    const { start, end } = monthDateBounds(yearMonth);
    conditions.push(gte(transactions.date, start));
    conditions.push(lte(transactions.date, end));
  }
  if (opts?.type === "income" || opts?.type === "expense") {
    conditions.push(eq(transactions.type, opts.type));
  }
  if (opts?.categoryId) {
    conditions.push(eq(transactions.categoryId, opts.categoryId));
  }

  const where = and(...conditions);
  const paginate = opts?.page != null || opts?.pageSize != null;
  const pageSize = paginate
    ? Math.min(100, Math.max(1, opts?.pageSize ?? 20))
    : undefined;
  const page = paginate ? Math.max(1, opts?.page ?? 1) : 1;
  const offset = paginate && pageSize ? (page - 1) * pageSize : 0;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(where);

  const total = Number(countRow?.count ?? 0);

  const spendCard = alias(creditCards, "spend_card");
  const billCard = alias(creditCards, "bill_card");
  const billActivity = alias(cardActivities, "bill_activity");

  const query = db
    .select({
      id: transactions.id,
      date: transactions.date,
      occurredAt: transactions.occurredAt,
      description: transactions.description,
      amount: transactions.amount,
      type: transactions.type,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryKind: categories.kind,
      creditCardId: transactions.creditCardId,
      creditCardName: spendCard.name,
      creditCardLastFour: spendCard.lastFour,
      bankAccountId: transactions.bankAccountId,
      bankAccountName: bankAccounts.name,
      billPayCardName: billCard.name,
      billPayCardLastFour: billCard.lastFour,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(spendCard, eq(transactions.creditCardId, spendCard.id))
    .leftJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
    .leftJoin(
      billActivity,
      and(
        eq(billActivity.transactionId, transactions.id),
        eq(billActivity.activityType, "bill_payment"),
      ),
    )
    .leftJoin(billCard, eq(billActivity.cardId, billCard.id))
    .where(where)
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt));

  const mapped = (
    pageSize != null
      ? await query.limit(pageSize).offset(offset)
      : await query
  ).map((row) => ({
    ...row,
    creditCardName: row.creditCardName
      ? formatCardLabel(row.creditCardName, row.creditCardLastFour)
      : null,
    billPayCardName: row.billPayCardName
      ? formatCardLabel(row.billPayCardName, row.billPayCardLastFour)
      : null,
  }));

  return {
    rows: mapped,
    total,
    page,
    pageSize: pageSize ?? total,
    totalPages: pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1,
  };
}

export async function listCategories(userId: string, kind?: "expense" | "income") {
  const conditions = [eq(categories.userId, userId)];
  if (kind) conditions.push(eq(categories.kind, kind));

  return db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(asc(categories.sortOrder));
}

/** Shared insert used by server actions and offline sync API. */
export async function insertTransactionForUser(
  userId: string,
  input: {
    date: string;
    description: string;
    categoryId: string;
    type: "expense" | "income";
    amount: number;
    occurredAt?: string;
    clientId?: string;
    creditCardId?: string | null;
    /** Pay down card outstanding (bill payment), not a new card spend. */
    cardBillPayId?: string | null;
    bankAccountId?: string | null;
  },
): Promise<{ id: string; duplicate: boolean }> {
  // Idempotent offline sync: same clientId → return existing, don't insert again
  if (input.clientId) {
    const existing = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.clientId, input.clientId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return { id: existing[0].id, duplicate: true };
    }
  }

  const occurredAt = input.occurredAt
    ? new Date(input.occurredAt)
    : new Date(`${input.date}T12:00:00`);
  const dateOnly =
    input.date ||
    (Number.isNaN(occurredAt.getTime())
      ? new Date().toISOString().slice(0, 10)
      : occurredAt.toISOString().slice(0, 10));

  const cardBillPayId =
    input.type === "expense" && input.cardBillPayId
      ? input.cardBillPayId
      : null;
  const creditCardId =
    input.type === "expense" && input.creditCardId && !cardBillPayId
      ? input.creditCardId
      : null;
  // Bill pay may also debit a bank account; card spend may not.
  const bankAccountId =
    creditCardId || !input.bankAccountId ? null : input.bankAccountId;

  try {
    const [row] = await db
      .insert(transactions)
      .values({
        userId,
        date: dateOnly,
        occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
        description: input.description,
        categoryId: input.categoryId,
        type: input.type,
        amount: input.amount.toFixed(2),
        creditCardId,
        bankAccountId,
        clientId: input.clientId ?? null,
      })
      .returning();

    if (creditCardId && input.amount > 0) {
      const { recordSpendOnCard } = await import("@/lib/credit-card-cashflow");
      await recordSpendOnCard({
        userId,
        cardId: creditCardId,
        date: dateOnly,
        amount: input.amount,
        description: input.description,
        transactionId: row.id,
      });
    } else if (cardBillPayId && input.amount > 0) {
      const { recordBillPaymentOnCard } = await import(
        "@/lib/credit-card-cashflow"
      );
      await recordBillPaymentOnCard({
        userId,
        cardId: cardBillPayId,
        date: dateOnly,
        amount: input.amount,
        description: input.description || "Bill payment",
        transactionId: row.id,
      });
    }

    if (bankAccountId && input.amount > 0) {
      const { applyBankBalanceForTransaction } = await import(
        "@/lib/bank-account-cashflow"
      );
      await applyBankBalanceForTransaction({
        userId,
        bankAccountId,
        type: input.type,
        amount: input.amount,
      });
    }

    return { id: row.id, duplicate: false };
  } catch (err) {
    // Race: another sync already inserted this clientId
    if (input.clientId) {
      const again = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.clientId, input.clientId),
          ),
        )
        .limit(1);
      if (again[0]) return { id: again[0].id, duplicate: true };
    }
    throw err;
  }
}

export async function getDebtDashboard(userId: string) {
  const { migrateRollingCreditCards } = await import("@/lib/card-actions");
  await migrateRollingCreditCards(userId);

  const accounts = await db
    .select()
    .from(debtAccounts)
    .where(eq(debtAccounts.userId, userId))
    .orderBy(asc(debtAccounts.name));

  const payments = await db
    .select({
      id: debtPayments.id,
      accountId: debtPayments.accountId,
      accountName: debtAccounts.name,
      dueDate: debtPayments.dueDate,
      paymentType: debtPayments.paymentType,
      amount: debtPayments.amount,
      principalAmount: debtPayments.principalAmount,
      interestAmount: debtPayments.interestAmount,
      gstAmount: debtPayments.gstAmount,
      isPaid: debtPayments.isPaid,
    })
    .from(debtPayments)
    .innerJoin(debtAccounts, eq(debtPayments.accountId, debtAccounts.id))
    .where(eq(debtPayments.userId, userId))
    .orderBy(desc(debtPayments.dueDate));

  const [settings] = await db
    .select()
    .from(debtSettings)
    .where(eq(debtSettings.userId, userId))
    .limit(1);

  const paydownByAccount = new Map<string, number>();
  const chargeByAccount = new Map<string, number>();
  const paidToDateByAccount = new Map<string, number>();
  const paymentsByAccount = new Map<
    string,
    {
      amount: number;
      isPaid: boolean;
      paymentType: string;
      principalAmount: number | null;
    }[]
  >();

  for (const p of payments) {
    const amount = toNumber(p.amount);
    const principalAmount =
      p.principalAmount != null ? toNumber(p.principalAmount) : null;
    const list = paymentsByAccount.get(p.accountId) ?? [];
    list.push({
      amount,
      isPaid: p.isPaid,
      paymentType: p.paymentType,
      principalAmount,
    });
    paymentsByAccount.set(p.accountId, list);

    if (!p.isPaid) continue;
    const effect = paymentBalanceEffect(p.paymentType);
    const paydownCredit =
      principalAmount != null ? principalAmount : amount;
    if (effect === "paydown") {
      paydownByAccount.set(
        p.accountId,
        (paydownByAccount.get(p.accountId) ?? 0) + paydownCredit,
      );
    } else if (effect === "charge") {
      chargeByAccount.set(
        p.accountId,
        (chargeByAccount.get(p.accountId) ?? 0) + amount,
      );
    }
    if (p.paymentType === PAID_TO_DATE_TYPE) {
      paidToDateByAccount.set(
        p.accountId,
        (paidToDateByAccount.get(p.accountId) ?? 0) + paydownCredit,
      );
    }
  }

  const accountRows = accounts.map((a) => {
    const starting = toNumber(a.startingBalance);
    const paid = paydownByAccount.get(a.id) ?? 0;
    const charges = chargeByAccount.get(a.id) ?? 0;
    const pending = computeOutstanding({
      startingBalance: starting,
      payments: paymentsByAccount.get(a.id) ?? [],
    });
    const monthlyEmiNum = toNumber(a.monthlyEmi);
    const interestPercent = toNumber(a.interestPercent);
    const gstPercent =
      a.gstPercent != null
        ? toNumber(a.gstPercent)
        : DEFAULT_GST_ON_INTEREST_PERCENT;
    const interestType = normalizeInterestType(a.interestType);
    const split = suggestInstallmentSplit({
      remainingPrincipal: pending,
      interestPercent,
      interestType,
      emiPi: monthlyEmiNum,
      gstPercent,
      totalMonths: a.totalMonths,
      startingBalance: starting,
    });
    const flatInterest = computeMonthlyInterest({
      startingBalance: starting,
      totalMonths: a.totalMonths,
      monthlyEmi: monthlyEmiNum,
    });
    const monthlyInterest =
      interestType === "reducing" ? split.interest : flatInterest;
    const monthlyPrincipal =
      interestType === "reducing"
        ? split.principal
        : Math.max(
            0,
            Math.round((monthlyEmiNum - flatInterest) * 100) / 100,
          );
    const monthlyGst =
      interestType === "reducing"
        ? split.gst
        : computeGstOnInterest(monthlyInterest, gstPercent);
    const monthlyToPay =
      Math.round((monthlyPrincipal + monthlyInterest + monthlyGst) * 100) /
      100;
    return {
      ...a,
      startingBalanceNum: starting,
      monthlyEmiNum,
      monthlyPrincipal,
      monthlyInterest,
      monthlyGst,
      monthlyToPay,
      totalPaid: paid,
      totalCharges: charges,
      paidTillNow: paidToDateByAccount.get(a.id) ?? 0,
      pending,
    };
  });

  const totals = accountRows.reduce(
    (acc, a) => ({
      starting: acc.starting + a.startingBalanceNum,
      paid: acc.paid + a.totalPaid,
      pending: acc.pending + a.pending,
    }),
    { starting: 0, paid: 0, pending: 0 },
  );

  const paymentsByMonth: Record<string, number> = {};
  for (const p of payments) {
    if (!p.isPaid) continue;
    const effect = paymentBalanceEffect(p.paymentType);
    if (effect !== "paydown") continue;
    const ym = yearMonthFromDate(p.dueDate);
    paymentsByMonth[ym] = (paymentsByMonth[ym] ?? 0) + toNumber(p.amount);
  }

  return {
    accounts: accountRows,
    payments,
    settings,
    totals,
    paymentsByMonth,
  };
}

export async function getDebtAccountDetail(userId: string, accountId: string) {
  const data = await getDebtDashboard(userId);
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) return null;

  const payments = data.payments.filter((p) => p.accountId === accountId);
  const monthsLeft = Math.max(0, account.totalMonths - account.monthsPaid);
  const interestPercentNum = toNumber(account.interestPercent);
  const gstPercentNum =
    account.gstPercent != null
      ? toNumber(account.gstPercent)
      : DEFAULT_GST_ON_INTEREST_PERCENT;
  const interestType = normalizeInterestType(account.interestType);
  const installment = suggestInstallmentSplit({
    remainingPrincipal: account.pending,
    interestPercent: interestPercentNum,
    interestType,
    emiPi: account.monthlyEmiNum,
    gstPercent: gstPercentNum,
    totalMonths: account.totalMonths,
    startingBalance: account.startingBalanceNum,
  });
  const flatMonthlyInterest = computeMonthlyInterest({
    startingBalance: account.startingBalanceNum,
    totalMonths: account.totalMonths,
    monthlyEmi: account.monthlyEmiNum,
  });
  const monthlyInterest =
    interestType === "reducing" ? installment.interest : flatMonthlyInterest;
  const monthlyPrincipal =
    interestType === "reducing"
      ? installment.principal
      : Math.max(
          0,
          Math.round((account.monthlyEmiNum - flatMonthlyInterest) * 100) / 100,
        );
  const monthlyGst =
    interestType === "reducing"
      ? installment.gst
      : computeGstOnInterest(monthlyInterest, gstPercentNum);
  const monthlyToPay =
    Math.round((monthlyPrincipal + monthlyInterest + monthlyGst) * 100) / 100;
  const totalInterest = computeTotalInterest({
    startingBalance: account.startingBalanceNum,
    totalMonths: account.totalMonths,
    monthlyEmi: account.monthlyEmiNum,
  });

  let creditCardName: string | null = null;
  if (account.creditCardId) {
    const [card] = await db
      .select({ name: creditCards.name })
      .from(creditCards)
      .where(
        and(
          eq(creditCards.id, account.creditCardId),
          eq(creditCards.userId, userId),
        ),
      )
      .limit(1);
    creditCardName = card?.name ?? null;
  }

  return {
    account: {
      ...account,
      interestPercentNum,
      gstPercentNum,
      monthsLeft,
      monthlyPrincipal,
      monthlyInterest,
      monthlyGst,
      monthlyToPay,
      totalInterest,
      creditCardName,
    },
    payments,
  };
}

function revalidateGoals() {
  revalidatePath("/goals");
  revalidatePath("/overview");
}

export async function listSavingsGoals(userId: string) {
  const rows = await db
    .select()
    .from(savingsGoals)
    .where(eq(savingsGoals.userId, userId))
    .orderBy(desc(savingsGoals.createdAt));

  return rows.map((g) => {
    const target = toNumber(g.targetAmount);
    const current = toNumber(g.currentAmount);
    const pct =
      target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    return {
      id: g.id,
      name: g.name,
      targetAmount: target,
      currentAmount: current,
      remaining: Math.max(0, target - current),
      pct,
      targetDate: g.targetDate,
      createdAt: g.createdAt,
    };
  });
}

export async function createSavingsGoal(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const targetAmount = parseAmount(String(formData.get("targetAmount") ?? "0"));
  const currentAmount = parseAmount(
    String(formData.get("currentAmount") ?? "0"),
  );
  const targetDateRaw = String(formData.get("targetDate") ?? "").trim();
  const targetDate = targetDateRaw || null;

  if (!name) throw new Error("Name is required");
  if (targetAmount <= 0) throw new Error("Target amount must be greater than 0");

  await db.insert(savingsGoals).values({
    userId: user.id,
    name,
    targetAmount: targetAmount.toFixed(2),
    currentAmount: Math.max(0, currentAmount).toFixed(2),
    targetDate,
  });

  revalidateGoals();
}

export async function contributeToSavingsGoal(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "0"));

  if (!id) throw new Error("Missing goal");
  if (amount <= 0) throw new Error("Amount must be greater than 0");

  const existing = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, user.id)))
    .limit(1);

  if (!existing[0]) throw new Error("Goal not found");

  const next = toNumber(existing[0].currentAmount) + amount;
  await db
    .update(savingsGoals)
    .set({ currentAmount: next.toFixed(2) })
    .where(eq(savingsGoals.id, id));

  revalidateGoals();
}

export async function deleteSavingsGoal(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, user.id)));

  revalidateGoals();
}

export async function changePassword(formData: FormData) {
  const sessionUser = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new Error("All password fields are required");
  }
  if (newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters");
  }
  if (newPassword !== confirmPassword) {
    throw new Error("New passwords do not match");
  }
  if (newPassword === currentPassword) {
    throw new Error("New password must be different from the current one");
  }

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!row) {
    throw new Error("Account not found. Sign out and sign in again.");
  }

  const valid = await compare(currentPassword, row.passwordHash);
  if (!valid) {
    throw new Error("Current password is incorrect");
  }

  const passwordHash = await hash(newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, row.id));

  revalidatePath("/settings");
}
