"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WRITE_RATE_LIMIT } from "@/lib/constants";
import { db } from "@/lib/db";
import {
  debtAccounts,
  debtPayments,
  debtSettings,
} from "@/lib/db/schema";
import {
  formCheckbox,
  formString,
  parseOrThrow,
  zDate,
  zNonEmpty,
  zUuid,
} from "@/lib/form-schemas";
import { parseAmount } from "@/lib/money";
import {
  assertOwnedCreditCard,
  assertOwnedDebtAccount,
} from "@/lib/ownership";
import { assertWriteRateLimit } from "@/lib/rate-limit";
import { UserFacingError } from "@/lib/safe-error";
import { requireUser } from "@/lib/session";
import {
  DEFAULT_GST_ON_INTEREST_PERCENT,
  PAID_TO_DATE_TYPE,
  normalizeInterestType,
  validateDebtTenure,
} from "@/lib/debt-account";
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
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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
      updatedAt: new Date(),
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
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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
    .set({ receivedTransactionId: null, updatedAt: new Date() })
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
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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
      .set({ goalPayoffDate, updatedAt: new Date() })
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
