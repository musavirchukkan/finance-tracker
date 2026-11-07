"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WRITE_RATE_LIMIT } from "@/lib/constants";
import { db } from "@/lib/db";
import {
  cardActivities,
  creditCards,
  transactions,
} from "@/lib/db/schema";
import {
  adjustCardOutstanding,
  deleteLinkedCashflowTx,
  ensureCardCashflowCategories,
} from "@/lib/credit-card-cashflow";
import {
  formCheckbox,
  formString,
  parseOrThrow,
  zDate,
  zUuid,
} from "@/lib/form-schemas";
import { assertOwnedBankAccount } from "@/lib/ownership";
import { parseAmount, toNumber } from "@/lib/money";
import { assertWriteRateLimit } from "@/lib/rate-limit";
import { UserFacingError } from "@/lib/safe-error";
import { requireUser } from "@/lib/session";

function revalidateCards(cardId?: string) {
  revalidatePath("/cards");
  if (cardId) revalidatePath(`/cards/${cardId}`);
  revalidatePath("/transactions");
  revalidatePath("/overview");
  revalidatePath("/budget");
  revalidatePath("/debt");
  revalidatePath("/quick-add");
}

const walletRechargeSchema = z.object({
  cardId: zUuid,
  date: zDate,
  walletCredit: z.string(),
  cardCharged: z.string(),
  description: z.string(),
});

export async function logWalletRecharge(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const raw = parseOrThrow(
    walletRechargeSchema,
    {
      cardId: formString(formData, "cardId").trim(),
      date: formString(formData, "date"),
      walletCredit: formString(formData, "walletCredit") || "0",
      cardCharged: formString(formData, "cardCharged") || "0",
      description: formString(formData, "description"),
    },
    "Missing fields",
  );
  const walletCredit = parseAmount(raw.walletCredit);
  const cardCharged = parseAmount(raw.cardCharged);
  const note = raw.description.trim();

  if (walletCredit <= 0 || cardCharged <= 0) {
    throw new UserFacingError("Enter wallet credit and card charged amounts");
  }
  if (cardCharged < walletCredit) {
    throw new UserFacingError("Card charged cannot be less than wallet credit");
  }

  const [card] = await db
    .select({ name: creditCards.name })
    .from(creditCards)
    .where(and(eq(creditCards.id, raw.cardId), eq(creditCards.userId, user.id)))
    .limit(1);
  if (!card) throw new UserFacingError("Card not found");

  const fee = Math.round((cardCharged - walletCredit) * 100) / 100;
  const description =
    note ||
    `Card → wallet ₹${walletCredit.toFixed(0)}` +
      (fee > 0 ? ` (card ₹${cardCharged.toFixed(0)}, fee ₹${fee.toFixed(0)})` : "") +
      ` — ${card.name}`;

  const cats = await ensureCardCashflowCategories(user.id);
  // Expense for what the card was charged; do not set creditCardId on the tx
  // (outstanding is updated via the activity below — avoid double-counting).
  const [tx] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      date: raw.date,
      occurredAt: new Date(`${raw.date}T12:00:00`),
      description,
      categoryId: cats.creditCardCategoryId,
      type: "expense",
      amount: cardCharged.toFixed(2),
      creditCardId: null,
    })
    .returning();

  await db.insert(cardActivities).values({
    userId: user.id,
    cardId: raw.cardId,
    date: raw.date,
    activityType: "wallet_recharge",
    amount: walletCredit.toFixed(2),
    outstandingDelta: cardCharged.toFixed(2),
    walletCredit: walletCredit.toFixed(2),
    cardCharged: cardCharged.toFixed(2),
    description,
    transactionId: tx?.id ?? null,
  });
  await adjustCardOutstanding(user.id, raw.cardId, cardCharged);
  revalidateCards(raw.cardId);
}

const cardFeeSchema = z.object({
  cardId: zUuid,
  date: zDate,
  amount: z.string(),
  description: z.string(),
});

export async function logCardFee(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const raw = parseOrThrow(
    cardFeeSchema,
    {
      cardId: formString(formData, "cardId").trim(),
      date: formString(formData, "date"),
      amount: formString(formData, "amount") || "0",
      description: formString(formData, "description"),
    },
    "Missing fields",
  );
  const amount = parseAmount(raw.amount);
  const logExpense = formCheckbox(formData, "logExpense");
  const note = raw.description.trim();

  if (amount <= 0) throw new UserFacingError("Enter fee amount");

  const [card] = await db
    .select({ name: creditCards.name })
    .from(creditCards)
    .where(and(eq(creditCards.id, raw.cardId), eq(creditCards.userId, user.id)))
    .limit(1);
  if (!card) throw new UserFacingError("Card not found");

  let transactionId: string | null = null;
  if (logExpense) {
    const cats = await ensureCardCashflowCategories(user.id);
    const [tx] = await db
      .insert(transactions)
      .values({
        userId: user.id,
        date: raw.date,
        occurredAt: new Date(`${raw.date}T12:00:00`),
        description: note || `Card fee — ${card.name}`,
        categoryId: cats.cardFeesCategoryId,
        type: "expense",
        amount: amount.toFixed(2),
      })
      .returning();
    transactionId = tx?.id ?? null;
  }

  await db.insert(cardActivities).values({
    userId: user.id,
    cardId: raw.cardId,
    date: raw.date,
    activityType: "fee",
    amount: amount.toFixed(2),
    outstandingDelta: amount.toFixed(2),
    description: note || `Fee ₹${amount.toFixed(0)}`,
    transactionId,
  });
  await adjustCardOutstanding(user.id, raw.cardId, amount);
  revalidateCards(raw.cardId);
}

const billPaymentSchema = z.object({
  cardId: zUuid,
  date: zDate,
  amount: z.string(),
  bankAccountId: zUuid,
  description: z.string(),
});

export async function logCardBillPayment(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const bankRaw = formString(formData, "bankAccountId").trim();
  if (!bankRaw) {
    throw new UserFacingError("Choose the account you paid from");
  }
  const raw = parseOrThrow(
    billPaymentSchema,
    {
      cardId: formString(formData, "cardId").trim(),
      date: formString(formData, "date"),
      amount: formString(formData, "amount") || "0",
      bankAccountId: bankRaw,
      description: formString(formData, "description"),
    },
    "Missing fields",
  );
  const amount = parseAmount(raw.amount);
  const note = raw.description.trim();

  if (amount <= 0) throw new UserFacingError("Enter payment amount");

  const [card] = await db
    .select({
      name: creditCards.name,
      statementAmount: creditCards.statementAmount,
    })
    .from(creditCards)
    .where(and(eq(creditCards.id, raw.cardId), eq(creditCards.userId, user.id)))
    .limit(1);
  if (!card) throw new UserFacingError("Card not found");

  await assertOwnedBankAccount(user.id, raw.bankAccountId);

  const cats = await ensureCardCashflowCategories(user.id);
  const billOccurredAt = new Date(`${raw.date}T12:00:00`);
  const [tx] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      date: raw.date,
      occurredAt: billOccurredAt,
      description: note || `Bill payment — ${card.name}`,
      categoryId: cats.creditCardCategoryId,
      type: "expense",
      amount: amount.toFixed(2),
      // Bill payment is from bank — do not treat as card spend.
      creditCardId: null,
      bankAccountId: raw.bankAccountId,
    })
    .returning();

  if (amount > 0) {
    const { applyBankBalanceForTransaction } = await import(
      "@/lib/bank-account-cashflow"
    );
    await applyBankBalanceForTransaction({
      userId: user.id,
      bankAccountId: raw.bankAccountId,
      type: "expense",
      amount,
      occurredAt: billOccurredAt,
    });
  }

  await db.insert(cardActivities).values({
    userId: user.id,
    cardId: raw.cardId,
    date: raw.date,
    activityType: "bill_payment",
    amount: amount.toFixed(2),
    outstandingDelta: (-amount).toFixed(2),
    description: note || `Bill payment ₹${amount.toFixed(0)}`,
    transactionId: tx?.id ?? null,
  });
  await adjustCardOutstanding(user.id, raw.cardId, -amount);

  // Reduce saved statement/bill amount so only unpaid remainder stays due.
  if (card.statementAmount != null) {
    const nextStatement = Math.max(0, toNumber(card.statementAmount) - amount);
    await db
      .update(creditCards)
      .set({
        statementAmount: nextStatement > 0 ? nextStatement.toFixed(2) : null,
        pinToCurrentStatement: nextStatement > 0,
        updatedAt: new Date(),
      })
      .where(and(eq(creditCards.id, raw.cardId), eq(creditCards.userId, user.id)));
  }

  revalidateCards(raw.cardId);
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${raw.bankAccountId}`);
}

export async function deleteCardActivity(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing activity",
  ).id;

  const [row] = await db
    .select()
    .from(cardActivities)
    .where(and(eq(cardActivities.id, id), eq(cardActivities.userId, user.id)))
    .limit(1);
  if (!row) return;

  const delta = toNumber(row.outstandingDelta);
  if (delta) await adjustCardOutstanding(user.id, row.cardId, -delta);

  await deleteLinkedCashflowTx(user.id, row.transactionId);
  await deleteLinkedCashflowTx(user.id, row.relatedTransactionId);

  await db
    .delete(cardActivities)
    .where(and(eq(cardActivities.id, id), eq(cardActivities.userId, user.id)));

  revalidateCards(row.cardId);
}
