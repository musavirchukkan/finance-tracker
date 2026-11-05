"use server";

import { compare, hash } from "bcryptjs";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  BCRYPT_ROUNDS,
  PASSWORD_MIN_LENGTH,
} from "@/lib/constants";
import { db } from "@/lib/db";
import {
  budgets,
  categories,
  debtAccounts,
  debtPayments,
  debtSettings,
  savingsGoals,
  transactions,
  users,
} from "@/lib/db/schema";
import { parseAmount, toNumber } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { parseUtcInstant } from "@/lib/utc-time";
import {
  DEFAULT_GST_ON_INTEREST_PERCENT,
  PAID_TO_DATE_TYPE,
  normalizeInterestType,
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
import { isCreditCardEmiType } from "@/lib/debt-kinds";
import {
  applyLinkedEmiForCycle,
  emiApplyModeFromChoice,
  parseEmiOutstandingChoice,
} from "@/lib/emi-statement-post";
import {
  assertOwnedTransactionInputs,
  insertTransactionForUser,
} from "@/lib/ledger-data";

function revalidateGoals() {
  revalidatePath("/goals");
  revalidatePath("/overview");
}

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
  const occurredAt = parseUtcInstant(String(formData.get("occurredAt") ?? ""));
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

  if (!id) throw new Error("Missing transaction");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(occurredAt.getTime())) {
    throw new Error("Enter a valid date and time");
  }

  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
    .limit(1);
  if (!existing) throw new Error("Transaction not found");

  await assertOwnedTransactionInputs(user.id, {
    categoryId,
    creditCardId,
    cardBillPayId,
    bankAccountId,
  });

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

  const updated = await db
    .update(transactions)
    .set({
      date,
      occurredAt,
      description,
      categoryId,
      type,
      amount: amount.toFixed(2),
      creditCardId,
      bankAccountId,
    })
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
    .returning();

  if (!updated[0]) {
    throw new Error("Transaction not found");
  }

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
  if (!id) throw new Error("Missing transaction");

  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
    .limit(1);
  if (!existing) throw new Error("Transaction not found");

  const { reverseActivitiesForTransaction } = await import(
    "@/lib/credit-card-cashflow"
  );
  const { reverseBankBalanceForTransaction } = await import(
    "@/lib/bank-account-cashflow"
  );
  await reverseBankBalanceForTransaction(user.id, id);
  await reverseActivitiesForTransaction(user.id, id);

  const deleted = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
    .returning();
  if (!deleted[0]) throw new Error("Transaction not found");

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
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `New password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
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

  const passwordHash = await hash(newPassword, BCRYPT_ROUNDS);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, row.id));

  revalidatePath("/settings");
}

