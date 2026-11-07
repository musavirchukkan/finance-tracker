"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import {
  formString,
  parseOrThrow,
  zDate,
  zNonEmpty,
  zOptionalUuid,
  zTxType,
  zUuid,
} from "@/lib/form-schemas";
import { parseAmount, toNumber } from "@/lib/money";
import { assertOwnedTransactionInputs } from "@/lib/ownership";
import { UserFacingError } from "@/lib/safe-error";
import { requireUser } from "@/lib/session";
import { insertTransactionForUser } from "@/lib/transaction-data";
import { parseUtcInstant } from "@/lib/utc-time";
import { assertWriteRateLimit } from "@/lib/rate-limit";
import { WRITE_RATE_LIMIT } from "@/lib/constants";

const createTxSchema = z
  .object({
    date: zDate,
    description: z.string(),
    categoryId: z.string(),
    type: zTxType,
    amount: z.string(),
    creditCardId: zOptionalUuid,
    cardBillPayId: zOptionalUuid,
    bankAccountId: zOptionalUuid,
    transferToBankAccountId: zOptionalUuid,
  })
  .superRefine((val, ctx) => {
    if (val.type !== "transfer" && !zUuid.safeParse(val.categoryId).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid category",
        path: ["categoryId"],
      });
    }
  });

const updateTxSchema = createTxSchema.extend({
  id: zUuid,
  occurredAt: zNonEmpty,
});

function parsePaymentSource(
  type: "expense" | "income" | "transfer",
  creditCardId: string | null,
  cardBillPayId: string | null,
  bankAccountId: string | null,
  transferToBankAccountId: string | null,
) {
  if (type === "transfer") {
    return {
      creditCardId: null,
      cardBillPayId: null,
      bankAccountId,
      transferToBankAccountId,
    };
  }
  const cardId = type === "expense" ? creditCardId : null;
  const billPayId = type === "expense" ? cardBillPayId : null;
  // Card spend is charged on the card — not paid from a bank account.
  // Bill pay can (and usually does) debit a bank / UPI account.
  const bankId = cardId ? null : bankAccountId;
  return {
    creditCardId: cardId,
    cardBillPayId: billPayId,
    bankAccountId: bankId,
    transferToBankAccountId: null,
  };
}

export async function createTransaction(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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
      transferToBankAccountId: formString(formData, "transferToBankAccountId"),
    },
    "Missing required fields",
  );
  const amount = parseAmount(raw.amount);
  if (!(amount > 0)) throw new UserFacingError("Enter a positive amount");
  const { creditCardId, cardBillPayId, bankAccountId, transferToBankAccountId } =
    parsePaymentSource(
      raw.type,
      raw.creditCardId,
      raw.cardBillPayId,
      raw.bankAccountId,
      raw.transferToBankAccountId,
    );

  const result = await insertTransactionForUser(user.id, {
    date: raw.date,
    description: raw.description,
    categoryId: raw.categoryId.trim() || raw.categoryId,
    type: raw.type,
    amount,
    creditCardId,
    cardBillPayId,
    bankAccountId,
    transferToBankAccountId,
    activitySource: "server_action",
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
    revalidatePath("/activity");
    if (creditCardId) revalidatePath(`/cards/${creditCardId}`);
    if (cardBillPayId) revalidatePath(`/cards/${cardBillPayId}`);
    if (bankAccountId) revalidatePath(`/accounts/${bankAccountId}`);
    if (transferToBankAccountId) {
      revalidatePath(`/accounts/${transferToBankAccountId}`);
    }
  }
}

export async function updateTransaction(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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
      transferToBankAccountId: formString(formData, "transferToBankAccountId"),
    },
    "Missing transaction",
  );
  const occurredAt = parseUtcInstant(raw.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new UserFacingError("Enter a valid date and time");
  }
  const amount = parseAmount(raw.amount);
  if (!(amount > 0)) throw new UserFacingError("Enter a positive amount");
  let { creditCardId, cardBillPayId, bankAccountId, transferToBankAccountId } =
    parsePaymentSource(
      raw.type,
      raw.creditCardId,
      raw.cardBillPayId,
      raw.bankAccountId,
      raw.transferToBankAccountId,
    );

  const [existing] = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      date: transactions.date,
      description: transactions.description,
      categoryId: transactions.categoryId,
      creditCardId: transactions.creditCardId,
      bankAccountId: transactions.bankAccountId,
      transferToBankAccountId: transactions.transferToBankAccountId,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(and(eq(transactions.id, raw.id), eq(transactions.userId, user.id)))
    .limit(1);
  if (!existing) throw new UserFacingError("Transaction not found");

  const {
    reverseActivitiesForTransaction,
    recordSpendOnCard,
    recordBillPaymentOnCard,
  } = await import("@/lib/credit-card-cashflow");
  const {
    applyLedgerBalanceTransition,
    ensureTransferCategory,
    normalizeTransferLegs,
  } = await import("@/lib/bank-account-cashflow");

  let categoryId = raw.categoryId;
  if (raw.type === "transfer") {
    categoryId = await ensureTransferCategory(user.id);
    const legs = normalizeTransferLegs({
      fromBankAccountId: bankAccountId,
      toBankAccountId: transferToBankAccountId,
      amount,
    });
    bankAccountId = legs.fromBankAccountId;
    transferToBankAccountId = legs.toBankAccountId;
    creditCardId = null;
    cardBillPayId = null;
  }

  await assertOwnedTransactionInputs(user.id, {
    categoryId,
    creditCardId,
    cardBillPayId,
    bankAccountId,
    transferToBankAccountId,
  });

  await reverseActivitiesForTransaction(user.id, raw.id);

  const updated = await db
    .update(transactions)
    .set({
      date: raw.date,
      occurredAt,
      description: raw.description,
      categoryId,
      type: raw.type,
      amount: amount.toFixed(2),
      creditCardId,
      bankAccountId,
      transferToBankAccountId:
        raw.type === "transfer" ? transferToBankAccountId : null,
    })
    .where(and(eq(transactions.id, raw.id), eq(transactions.userId, user.id)))
    .returning();

  if (!updated[0]) {
    throw new UserFacingError("Transaction not found");
  }

  await applyLedgerBalanceTransition({
    userId: user.id,
    from: {
      type: existing.type,
      amount: toNumber(existing.amount),
      bankAccountId: existing.bankAccountId,
      transferToBankAccountId: existing.transferToBankAccountId,
      occurredAt: existing.occurredAt,
    },
    to: {
      type: raw.type,
      amount,
      bankAccountId,
      transferToBankAccountId:
        raw.type === "transfer" ? transferToBankAccountId : null,
      occurredAt,
    },
  });

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

  const {
    recordActivityEvent,
    summarizeTransactionActivity,
    transactionActivitySnapshot,
  } = await import("@/lib/activity-log");
  const before = transactionActivitySnapshot({
    type: existing.type,
    amount: toNumber(existing.amount),
    date: existing.date,
    description: existing.description,
    categoryId: existing.categoryId,
    bankAccountId: existing.bankAccountId,
    transferToBankAccountId: existing.transferToBankAccountId,
    creditCardId: existing.creditCardId,
  });
  const after = transactionActivitySnapshot({
    type: raw.type,
    amount,
    date: raw.date,
    description: raw.description,
    categoryId,
    bankAccountId,
    transferToBankAccountId:
      raw.type === "transfer" ? transferToBankAccountId : null,
    creditCardId,
    cardBillPayId,
  });
  await recordActivityEvent({
    userId: user.id,
    action: "transaction.update",
    entityType: "transaction",
    entityId: raw.id,
    summary: summarizeTransactionActivity({ verb: "Updated", snapshot: after }),
    before,
    after,
    source: "server_action",
  });

  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/goals");
  revalidatePath("/cards");
  revalidatePath("/accounts");
  revalidatePath("/activity");
  if (creditCardId) revalidatePath(`/cards/${creditCardId}`);
  if (cardBillPayId) revalidatePath(`/cards/${cardBillPayId}`);
  if (bankAccountId) revalidatePath(`/accounts/${bankAccountId}`);
  if (transferToBankAccountId) {
    revalidatePath(`/accounts/${transferToBankAccountId}`);
  }
}

export async function deleteTransaction(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing transaction",
  ).id;

  const [existing] = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      date: transactions.date,
      description: transactions.description,
      categoryId: transactions.categoryId,
      creditCardId: transactions.creditCardId,
      bankAccountId: transactions.bankAccountId,
      transferToBankAccountId: transactions.transferToBankAccountId,
    })
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

  const {
    recordActivityEvent,
    summarizeTransactionActivity,
    transactionActivitySnapshot,
  } = await import("@/lib/activity-log");
  const before = transactionActivitySnapshot({
    type: existing.type,
    amount: toNumber(existing.amount),
    date: existing.date,
    description: existing.description,
    categoryId: existing.categoryId,
    bankAccountId: existing.bankAccountId,
    transferToBankAccountId: existing.transferToBankAccountId,
    creditCardId: existing.creditCardId,
  });
  await recordActivityEvent({
    userId: user.id,
    action: "transaction.delete",
    entityType: "transaction",
    entityId: id,
    summary: summarizeTransactionActivity({
      verb: "Deleted",
      snapshot: before,
    }),
    before,
    source: "server_action",
  });

  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/goals");
  revalidatePath("/cards");
  revalidatePath("/accounts");
  revalidatePath("/activity");
}
