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
  deleteLinkedCashflowTx,
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
  zNonEmpty,
  zUuid,
} from "@/lib/form-schemas";
import { parseAmount } from "@/lib/money";
import { assertWriteRateLimit } from "@/lib/rate-limit";
import { invalidateCardOptionsCache } from "@/lib/ref-cache";
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
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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

  await invalidateCardOptionsCache(user.id);
  revalidateCards(row?.id);
  if (sharesLimitWithId) revalidateCards(sharesLimitWithId);
}

export async function updateCreditCard(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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

  await invalidateCardOptionsCache(user.id);
  revalidateCards(id);
  if (sharesLimitWithId) revalidateCards(sharesLimitWithId);
}

export async function deleteCreditCard(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
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

  await invalidateCardOptionsCache(user.id);
  revalidateCards(id);
}
