"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
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
  clampBillingDay,
  clampDueGapDays,
  normalizeCardStatus,
  normalizeLastFour,
} from "@/lib/credit-cards";
import {
  formCheckbox,
  formString,
  parseOrThrow,
  zDate,
  zNonEmpty,
  zUuid,
} from "@/lib/form-schemas";
import { assertOwnedBankAccount } from "@/lib/ledger-data";
import { parseAmount, toNumber } from "@/lib/money";
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

async function parseSharesLimitWithId(
  userId: string,
  cardId: string | null,
  raw: string,
) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const idParsed = zUuid.safeParse(trimmed);
  if (!idParsed.success) {
    throw new UserFacingError("Shared-limit card not found");
  }
  if (cardId && idParsed.data === cardId) {
    throw new UserFacingError("A card cannot share limit with itself");
  }
  const [target] = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, idParsed.data), eq(creditCards.userId, userId)))
    .limit(1);
  if (!target) throw new UserFacingError("Shared-limit card not found");
  if (target.sharesLimitWithId) {
    throw new UserFacingError("Pick the card that owns the shared limit");
  }
  return target.id;
}

const cardUpsertSchema = z.object({
  name: zNonEmpty,
  currentOutstanding: z.string(),
  creditLimit: z.string(),
  billingDay: z.string(),
  paymentDueGapDays: z.string(),
  statementAmount: z.string(),
  status: z.string(),
  lastFour: z.string(),
  sharesLimitWithId: z.string(),
});

function parseCardFields(formData: FormData) {
  return parseOrThrow(
    cardUpsertSchema,
    {
      name: formString(formData, "name"),
      currentOutstanding: formString(formData, "currentOutstanding") || "0",
      creditLimit: formString(formData, "creditLimit"),
      billingDay: formString(formData, "billingDay"),
      paymentDueGapDays: formString(formData, "paymentDueGapDays"),
      statementAmount: formString(formData, "statementAmount"),
      status: formString(formData, "status") || "Active",
      lastFour: formString(formData, "lastFour"),
      sharesLimitWithId: formString(formData, "sharesLimitWithId"),
    },
    "Name is required",
  );
}

export async function createCreditCard(formData: FormData) {
  const user = await requireUser();
  const raw = parseCardFields(formData);
  const outstanding = parseAmount(raw.currentOutstanding);
  const sharesLimitWithId = await parseSharesLimitWithId(
    user.id,
    null,
    raw.sharesLimitWithId,
  );
  const limitRaw = raw.creditLimit.trim();
  const creditLimit =
    sharesLimitWithId || !limitRaw ? null : parseAmount(limitRaw);
  const billingDay = clampBillingDay(Number(raw.billingDay) || null);
  const paymentDueGapDays = clampDueGapDays(
    Number(raw.paymentDueGapDays) || null,
  );
  const statementRaw = raw.statementAmount.trim();
  const statementAmount =
    statementRaw === "" ? null : parseAmount(statementRaw);
  const pinToCurrentStatement = formCheckbox(formData, "pinToCurrentStatement");
  const status = normalizeCardStatus(raw.status);
  const lastFour = normalizeLastFour(raw.lastFour);
  const isRupay = formCheckbox(formData, "isRupay");

  const [row] = await db
    .insert(creditCards)
    .values({
      userId: user.id,
      name: raw.name,
      currentOutstanding: Math.max(0, outstanding).toFixed(2),
      statementAmount:
        statementAmount != null ? Math.max(0, statementAmount).toFixed(2) : null,
      pinToCurrentStatement,
      creditLimit: creditLimit != null ? creditLimit.toFixed(2) : null,
      sharesLimitWithId,
      billingDay,
      paymentDueGapDays,
      lastFour,
      isRupay,
      status,
    })
    .returning();

  revalidateCards(row?.id);
  if (sharesLimitWithId) revalidateCards(sharesLimitWithId);
}

export async function updateCreditCard(formData: FormData) {
  const user = await requireUser();
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing fields",
  ).id;
  const raw = parseCardFields(formData);
  const outstanding = parseAmount(raw.currentOutstanding);
  const sharesLimitWithId = await parseSharesLimitWithId(
    user.id,
    id,
    raw.sharesLimitWithId,
  );
  const limitRaw = raw.creditLimit.trim();
  const creditLimit =
    sharesLimitWithId || !limitRaw ? null : parseAmount(limitRaw);
  const billingDay = clampBillingDay(Number(raw.billingDay) || null);
  const paymentDueGapDays = clampDueGapDays(
    Number(raw.paymentDueGapDays) || null,
  );
  const statementRaw = raw.statementAmount.trim();
  const statementAmount =
    statementRaw === "" ? null : parseAmount(statementRaw);
  const pinToCurrentStatement = formCheckbox(formData, "pinToCurrentStatement");
  const status = normalizeCardStatus(raw.status);
  const lastFour = normalizeLastFour(raw.lastFour);
  const isRupay = formCheckbox(formData, "isRupay");

  // Clear dependents pointing at this card if it starts sharing with another.
  if (sharesLimitWithId) {
    await db
      .update(creditCards)
      .set({ sharesLimitWithId: null, updatedAt: new Date() })
      .where(
        and(
          eq(creditCards.userId, user.id),
          eq(creditCards.sharesLimitWithId, id),
        ),
      );
  }

  await db
    .update(creditCards)
    .set({
      name: raw.name,
      currentOutstanding: Math.max(0, outstanding).toFixed(2),
      statementAmount:
        statementAmount != null ? Math.max(0, statementAmount).toFixed(2) : null,
      pinToCurrentStatement,
      creditLimit: creditLimit != null ? creditLimit.toFixed(2) : null,
      sharesLimitWithId,
      billingDay,
      paymentDueGapDays,
      lastFour,
      isRupay,
      status,
      updatedAt: new Date(),
    })
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, user.id)));

  revalidateCards(id);
  if (sharesLimitWithId) revalidateCards(sharesLimitWithId);
}

export async function deleteCreditCard(formData: FormData) {
  const user = await requireUser();
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing card",
  ).id;

  const activities = await db
    .select()
    .from(cardActivities)
    .where(and(eq(cardActivities.cardId, id), eq(cardActivities.userId, user.id)));

  for (const a of activities) {
    await deleteLinkedCashflowTx(user.id, a.transactionId);
    await deleteLinkedCashflowTx(user.id, a.relatedTransactionId);
  }

  await db
    .update(transactions)
    .set({ creditCardId: null })
    .where(
      and(eq(transactions.creditCardId, id), eq(transactions.userId, user.id)),
    );

  await db
    .delete(creditCards)
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, user.id)));

  revalidateCards(id);
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
