"use server";

import { compare, hash } from "bcryptjs";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BCRYPT_ROUNDS } from "@/lib/constants";
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
import {
  formCheckbox,
  formString,
  parseOrThrow,
  zDate,
  zIncomeExpense,
  zNonEmpty,
  zOptionalUuid,
  zPassword,
  zUuid,
  zYearMonth,
} from "@/lib/form-schemas";
import { parseAmount, toNumber } from "@/lib/money";
import { UserFacingError } from "@/lib/safe-error";
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
  assertOwnedCreditCard,
  assertOwnedDebtAccount,
  assertOwnedTransactionInputs,
  insertTransactionForUser,
} from "@/lib/ledger-data";

function revalidateGoals() {
  revalidatePath("/goals");
  revalidatePath("/overview");
}

const createTxSchema = z.object({
  date: zDate,
  description: z.string(),
  categoryId: zUuid,
  type: zIncomeExpense,
  amount: z.string(),
  creditCardId: zOptionalUuid,
  cardBillPayId: zOptionalUuid,
  bankAccountId: zOptionalUuid,
});

const updateTxSchema = createTxSchema.extend({
  id: zUuid,
  occurredAt: zNonEmpty,
});

function parsePaymentSource(
  type: "expense" | "income",
  creditCardId: string | null,
  cardBillPayId: string | null,
  bankAccountId: string | null,
) {
  const cardId = type === "expense" ? creditCardId : null;
  const billPayId = type === "expense" ? cardBillPayId : null;
  // Card spend is charged on the card — not paid from a bank account.
  // Bill pay can (and usually does) debit a bank / UPI account.
  const bankId = cardId ? null : bankAccountId;
  return {
    creditCardId: cardId,
    cardBillPayId: billPayId,
    bankAccountId: bankId,
  };
}

export async function createTransaction(formData: FormData) {
  const user = await requireUser();
  const raw = parseOrThrow(
    createTxSchema,
    {
      date: formString(formData, "date"),
      description: formString(formData, "description").trim(),
      categoryId: formString(formData, "categoryId").trim(),
      type: formString(formData, "type") || "expense",
      amount: formString(formData, "amount") || "0",
      creditCardId: formString(formData, "creditCardId"),
      cardBillPayId: formString(formData, "cardBillPayId"),
      bankAccountId: formString(formData, "bankAccountId"),
    },
    "Missing required fields",
  );
  const amount = parseAmount(raw.amount);
  const { creditCardId, cardBillPayId, bankAccountId } = parsePaymentSource(
    raw.type,
    raw.creditCardId,
    raw.cardBillPayId,
    raw.bankAccountId,
  );

  const result = await insertTransactionForUser(user.id, {
    date: raw.date,
    description: raw.description,
    categoryId: raw.categoryId,
    type: raw.type,
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
  const raw = parseOrThrow(
    updateTxSchema,
    {
      id: formString(formData, "id").trim(),
      date: formString(formData, "date"),
      occurredAt: formString(formData, "occurredAt"),
      description: formString(formData, "description").trim(),
      categoryId: formString(formData, "categoryId").trim(),
      type: formString(formData, "type") || "expense",
      amount: formString(formData, "amount") || "0",
      creditCardId: formString(formData, "creditCardId"),
      cardBillPayId: formString(formData, "cardBillPayId"),
      bankAccountId: formString(formData, "bankAccountId"),
    },
    "Missing transaction",
  );
  const occurredAt = parseUtcInstant(raw.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new UserFacingError("Enter a valid date and time");
  }
  const amount = parseAmount(raw.amount);
  const { creditCardId, cardBillPayId, bankAccountId } = parsePaymentSource(
    raw.type,
    raw.creditCardId,
    raw.cardBillPayId,
    raw.bankAccountId,
  );

  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, raw.id), eq(transactions.userId, user.id)))
    .limit(1);
  if (!existing) throw new UserFacingError("Transaction not found");

  await assertOwnedTransactionInputs(user.id, {
    categoryId: raw.categoryId,
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

  await reverseBankBalanceForTransaction(user.id, raw.id);
  await reverseActivitiesForTransaction(user.id, raw.id);

  const updated = await db
    .update(transactions)
    .set({
      date: raw.date,
      occurredAt,
      description: raw.description,
      categoryId: raw.categoryId,
      type: raw.type,
      amount: amount.toFixed(2),
      creditCardId,
      bankAccountId,
    })
    .where(and(eq(transactions.id, raw.id), eq(transactions.userId, user.id)))
    .returning();

  if (!updated[0]) {
    throw new UserFacingError("Transaction not found");
  }

  if (raw.type === "expense" && creditCardId && amount > 0) {
    await recordSpendOnCard({
      userId: user.id,
      cardId: creditCardId,
      date: raw.date,
      amount,
      description: raw.description,
      transactionId: raw.id,
    });
  } else if (raw.type === "expense" && cardBillPayId && amount > 0) {
    await recordBillPaymentOnCard({
      userId: user.id,
      cardId: cardBillPayId,
      date: raw.date,
      amount,
      description: raw.description || `Bill payment`,
      transactionId: raw.id,
    });
  }

  await applyBankBalanceForTransaction({
    userId: user.id,
    bankAccountId,
    type: raw.type,
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
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing transaction",
  ).id;

  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
    .limit(1);
  if (!existing) throw new UserFacingError("Transaction not found");

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
  if (!deleted[0]) throw new UserFacingError("Transaction not found");

  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/goals");
  revalidatePath("/cards");
  revalidatePath("/accounts");
}

const budgetSchema = z.object({
  categoryId: zUuid,
  yearMonth: zYearMonth,
  amount: z.string(),
});

export async function upsertBudgetAmount(formData: FormData) {
  const user = await requireUser();
  const raw = parseOrThrow(
    budgetSchema,
    {
      categoryId: formString(formData, "categoryId").trim(),
      yearMonth: formString(formData, "yearMonth").trim(),
      amount: formString(formData, "amount") || "0",
    },
    "Missing budget fields",
  );
  const amount = parseAmount(raw.amount);

  const [cat] = await db
    .select()
    .from(categories)
    .where(
      and(eq(categories.id, raw.categoryId), eq(categories.userId, user.id)),
    )
    .limit(1);
  if (!cat || cat.kind !== "expense" || !isBudgetableCategoryName(cat.name)) {
    throw new UserFacingError("This category cannot have a budget");
  }

  const existing = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, user.id),
        eq(budgets.categoryId, raw.categoryId),
        eq(budgets.yearMonth, raw.yearMonth),
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
      categoryId: raw.categoryId,
      yearMonth: raw.yearMonth,
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

const debtAccountSchema = z.object({
  name: zNonEmpty,
  type: zNonEmpty,
  startingBalance: z.string(),
  monthlyEmi: z.string(),
  interestPercent: z.string(),
  interestType: z.string(),
  gstPercent: z.string(),
  totalMonths: z.string(),
  monthsPaid: z.string(),
  paidTillNow: z.string(),
  status: z.string(),
  creditCardId: z.string(),
});

function parseDebtFields(formData: FormData) {
  const raw = parseOrThrow(
    debtAccountSchema,
    {
      name: formString(formData, "name"),
      type: formString(formData, "type"),
      startingBalance: formString(formData, "startingBalance") || "0",
      monthlyEmi: formString(formData, "monthlyEmi") || "0",
      interestPercent: formString(formData, "interestPercent") || "0",
      interestType: formString(formData, "interestType") || "fixed",
      gstPercent: formString(formData, "gstPercent"),
      totalMonths: formString(formData, "totalMonths") || "0",
      monthsPaid: formString(formData, "monthsPaid") || "0",
      paidTillNow: formString(formData, "paidTillNow") || "0",
      status: formString(formData, "status") || "Active Paydown",
      creditCardId: formString(formData, "creditCardId"),
    },
    "Name and type are required",
  );

  const startingBalance = parseAmount(raw.startingBalance);
  const monthlyEmi = parseAmount(raw.monthlyEmi);
  const interestPercent = Math.max(0, parseAmount(raw.interestPercent));
  const interestType = normalizeInterestType(raw.interestType);
  const gstRaw = raw.gstPercent.trim();
  const gstPercent = Math.max(
    0,
    gstRaw === "" ? DEFAULT_GST_ON_INTEREST_PERCENT : parseAmount(gstRaw),
  );
  const totalMonths = Math.max(0, Math.floor(Number(raw.totalMonths) || 0));
  const monthsPaid = Math.max(0, Math.floor(Number(raw.monthsPaid) || 0));
  const paidTillNow = parseAmount(raw.paidTillNow);
  const status = raw.status.trim() || "Active Paydown";

  let creditCardId: string | null = null;
  if (isCreditCardEmiType(raw.type)) {
    const cardParsed = zUuid.safeParse(raw.creditCardId.trim());
    if (!cardParsed.success) {
      throw new UserFacingError("Choose a credit card for Credit Card EMI");
    }
    creditCardId = cardParsed.data;
  }

  validateDebtTenure({
    startingBalance,
    monthlyEmi,
    totalMonths,
    monthsPaid,
    paidTillNow,
  });

  return {
    name: raw.name,
    type: raw.type,
    startingBalance,
    monthlyEmi,
    interestPercent,
    interestType,
    gstPercent,
    totalMonths,
    monthsPaid,
    paidTillNow,
    status,
    creditCardId,
  };
}

export async function createDebtAccount(formData: FormData) {
  const user = await requireUser();
  const fields = parseDebtFields(formData);
  if (fields.creditCardId) {
    await assertOwnedCreditCard(user.id, fields.creditCardId);
  }
  const logOpeningCashflow =
    formCheckbox(formData, "logAsIncome") ||
    formCheckbox(formData, "logOpeningCashflow");

  let receivedTransactionId: string | null = null;
  const today = new Date().toISOString().slice(0, 10);
  if (logOpeningCashflow && fields.startingBalance > 0) {
    if (isLentType(fields.type)) {
      receivedTransactionId = await createLentExpenseTransaction({
        userId: user.id,
        accountName: fields.name,
        amount: fields.startingBalance.toFixed(2),
        date: today,
      });
    } else if (isBorrowedType(fields.type)) {
      receivedTransactionId = await createBorrowedIncomeTransaction({
        userId: user.id,
        accountName: fields.name,
        amount: fields.startingBalance.toFixed(2),
        date: today,
      });
    }
  }

  const [account] = await db
    .insert(debtAccounts)
    .values({
      userId: user.id,
      name: fields.name,
      type: fields.type,
      startingBalance: fields.startingBalance.toFixed(2),
      monthlyEmi: fields.monthlyEmi.toFixed(2),
      interestPercent: fields.interestPercent.toFixed(2),
      interestType: fields.interestType,
      gstPercent: fields.gstPercent.toFixed(2),
      totalMonths: fields.totalMonths,
      monthsPaid: fields.monthsPaid,
      status: fields.status,
      creditCardId: fields.creditCardId,
      receivedTransactionId,
    })
    .returning();

  if (account && fields.paidTillNow > 0) {
    await db.insert(debtPayments).values({
      userId: user.id,
      accountId: account.id,
      dueDate: today,
      paymentType: PAID_TO_DATE_TYPE,
      amount: fields.paidTillNow.toFixed(2),
      principalAmount: fields.paidTillNow.toFixed(2),
      interestAmount: "0",
      gstAmount: "0",
      isPaid: true,
    });
  }

  if (account && fields.creditCardId) {
    const emiMode = emiApplyModeFromChoice(
      parseEmiOutstandingChoice(formString(formData, "emiOutstandingChoice")),
    );
    if (emiMode) {
      await applyLinkedEmiForCycle({
        userId: user.id,
        debtId: account.id,
        mode: emiMode,
      });
    }
  }

  revalidateDebtCashflow(account?.id, fields.creditCardId);
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
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing fields",
  ).id;
  const fields = parseDebtFields(formData);
  if (fields.creditCardId) {
    await assertOwnedCreditCard(user.id, fields.creditCardId);
  }

  const [prev] = await db
    .select({ creditCardId: debtAccounts.creditCardId })
    .from(debtAccounts)
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, user.id)))
    .limit(1);

  await db
    .update(debtAccounts)
    .set({
      name: fields.name,
      type: fields.type,
      startingBalance: fields.startingBalance.toFixed(2),
      monthlyEmi: fields.monthlyEmi.toFixed(2),
      interestPercent: fields.interestPercent.toFixed(2),
      interestType: fields.interestType,
      gstPercent: fields.gstPercent.toFixed(2),
      totalMonths: fields.totalMonths,
      monthsPaid: fields.monthsPaid,
      status: fields.status,
      creditCardId: fields.creditCardId,
    })
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, user.id)));

  await upsertPaidToDatePayment({
    userId: user.id,
    accountId: id,
    paidTillNow: fields.paidTillNow,
  });

  if (fields.creditCardId) {
    const emiMode = emiApplyModeFromChoice(
      parseEmiOutstandingChoice(formString(formData, "emiOutstandingChoice")),
    );
    if (emiMode) {
      await applyLinkedEmiForCycle({
        userId: user.id,
        debtId: id,
        mode: emiMode,
      });
    }
  }

  revalidateDebtCashflow(id, fields.creditCardId);
  if (prev?.creditCardId && prev.creditCardId !== fields.creditCardId) {
    revalidatePath(`/cards/${prev.creditCardId}`);
  }
}

export async function deleteDebtAccount(formData: FormData) {
  const user = await requireUser();
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing account",
  ).id;

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

function parseOptionalAmount(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  return parseAmount(s);
}

const debtPaymentSchema = z.object({
  accountId: zUuid,
  dueDate: zDate,
  paymentType: z.string().trim().default("EMI"),
  amount: z.string(),
  principalAmount: z.string(),
  interestAmount: z.string(),
  gstAmount: z.string(),
});

export async function createDebtPayment(formData: FormData) {
  const user = await requireUser();
  const raw = parseOrThrow(
    debtPaymentSchema,
    {
      accountId: formString(formData, "accountId").trim(),
      dueDate: formString(formData, "dueDate"),
      paymentType: formString(formData, "paymentType") || "EMI",
      amount: formString(formData, "amount"),
      principalAmount: formString(formData, "principalAmount"),
      interestAmount: formString(formData, "interestAmount"),
      gstAmount: formString(formData, "gstAmount"),
    },
    "Missing fields",
  );
  const isPaid = formCheckbox(formData, "isPaid");

  const principalAmount = parseOptionalAmount(raw.principalAmount);
  const interestAmount = parseOptionalAmount(raw.interestAmount);
  const gstAmount = parseOptionalAmount(raw.gstAmount);
  const hasSplit =
    principalAmount != null || interestAmount != null || gstAmount != null;
  const splitTotal =
    (principalAmount ?? 0) + (interestAmount ?? 0) + (gstAmount ?? 0);
  const amount = hasSplit
    ? Math.round(splitTotal * 100) / 100
    : parseAmount(raw.amount.trim() || "0");
  if (amount <= 0) throw new UserFacingError("Enter payment amount");

  await assertOwnedDebtAccount(user.id, raw.accountId);

  const [payment] = await db
    .insert(debtPayments)
    .values({
      userId: user.id,
      accountId: raw.accountId,
      dueDate: raw.dueDate,
      paymentType: raw.paymentType || "EMI",
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

  const cardId = await creditCardIdForDebtAccount(user.id, raw.accountId);
  revalidateDebtCashflow(raw.accountId, cardId);
}

export async function toggleDebtPaymentPaid(formData: FormData) {
  const user = await requireUser();
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing payment",
  ).id;
  const isPaid = formString(formData, "isPaid") === "true";

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
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing payment",
  ).id;

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
  const goalPayoffDate = formString(formData, "goalPayoffDate");
  if (goalPayoffDate && !zDate.safeParse(goalPayoffDate).success) {
    throw new UserFacingError("Enter a valid date");
  }

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

const categorySchema = z.object({
  name: zNonEmpty,
  kind: zIncomeExpense,
  icon: z.string(),
});

export async function createCategory(formData: FormData) {
  const user = await requireUser();
  const raw = parseOrThrow(
    categorySchema,
    {
      name: formString(formData, "name"),
      kind: formString(formData, "kind") || "expense",
      icon: formString(formData, "icon"),
    },
    "Name required",
  );
  const icon = raw.icon.trim() || null;

  const max = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(eq(categories.userId, user.id))
    .orderBy(desc(categories.sortOrder))
    .limit(1);

  await db.insert(categories).values({
    userId: user.id,
    name: raw.name,
    kind: raw.kind,
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
  const raw = parseOrThrow(
    categorySchema.extend({ id: zUuid }),
    {
      id: formString(formData, "id").trim(),
      name: formString(formData, "name"),
      kind: formString(formData, "kind") || "expense",
      icon: formString(formData, "icon"),
    },
    "Missing fields",
  );
  const icon = raw.icon.trim() || null;

  await db
    .update(categories)
    .set({ name: raw.name, kind: raw.kind, icon })
    .where(and(eq(categories.id, raw.id), eq(categories.userId, user.id)));

  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
}

export async function deleteCategory(formData: FormData) {
  const user = await requireUser();
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing category",
  ).id;

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

const savingsGoalSchema = z.object({
  name: zNonEmpty,
  targetAmount: z.string(),
  currentAmount: z.string(),
  targetDate: z.string(),
});

export async function createSavingsGoal(formData: FormData) {
  const user = await requireUser();
  const raw = parseOrThrow(
    savingsGoalSchema,
    {
      name: formString(formData, "name"),
      targetAmount: formString(formData, "targetAmount") || "0",
      currentAmount: formString(formData, "currentAmount") || "0",
      targetDate: formString(formData, "targetDate"),
    },
    "Name is required",
  );
  const targetAmount = parseAmount(raw.targetAmount);
  const currentAmount = parseAmount(raw.currentAmount);
  const targetDate = raw.targetDate.trim() || null;
  if (targetDate && !zDate.safeParse(targetDate).success) {
    throw new UserFacingError("Enter a valid target date");
  }
  if (targetAmount <= 0) {
    throw new UserFacingError("Target amount must be greater than 0");
  }

  await db.insert(savingsGoals).values({
    userId: user.id,
    name: raw.name,
    targetAmount: targetAmount.toFixed(2),
    currentAmount: Math.max(0, currentAmount).toFixed(2),
    targetDate,
  });

  revalidateGoals();
}

export async function contributeToSavingsGoal(formData: FormData) {
  const user = await requireUser();
  const raw = parseOrThrow(
    z.object({ id: zUuid, amount: z.string() }),
    {
      id: formString(formData, "id").trim(),
      amount: formString(formData, "amount") || "0",
    },
    "Missing goal",
  );
  const amount = parseAmount(raw.amount);
  if (amount <= 0) throw new UserFacingError("Amount must be greater than 0");

  const existing = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, raw.id), eq(savingsGoals.userId, user.id)))
    .limit(1);

  if (!existing[0]) throw new UserFacingError("Goal not found");

  const next = toNumber(existing[0].currentAmount) + amount;
  await db
    .update(savingsGoals)
    .set({ currentAmount: next.toFixed(2) })
    .where(eq(savingsGoals.id, raw.id));

  revalidateGoals();
}

export async function deleteSavingsGoal(formData: FormData) {
  const user = await requireUser();
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing goal",
  ).id;

  await db
    .delete(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, user.id)));

  revalidateGoals();
}

const changePasswordSchema = z.object({
  currentPassword: zNonEmpty,
  newPassword: zPassword,
  confirmPassword: z.string(),
});

export async function changePassword(formData: FormData) {
  const sessionUser = await requireUser();
  const raw = parseOrThrow(
    changePasswordSchema,
    {
      currentPassword: formString(formData, "currentPassword"),
      newPassword: formString(formData, "newPassword"),
      confirmPassword: formString(formData, "confirmPassword"),
    },
    "All password fields are required",
  );

  if (raw.newPassword !== raw.confirmPassword) {
    throw new UserFacingError("New passwords do not match");
  }
  if (raw.newPassword === raw.currentPassword) {
    throw new UserFacingError("New password must be different from the current one");
  }

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!row) {
    throw new UserFacingError("Account not found. Sign out and sign in again.");
  }

  const valid = await compare(raw.currentPassword, row.passwordHash);
  if (!valid) {
    throw new UserFacingError("Current password is incorrect");
  }

  const passwordHash = await hash(raw.newPassword, BCRYPT_ROUNDS);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, row.id));

  revalidatePath("/settings");
}
