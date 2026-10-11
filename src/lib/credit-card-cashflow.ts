import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cardActivities,
  categories,
  creditCards,
  transactions,
} from "@/lib/db/schema";
import { defaultIconForCategoryName } from "@/lib/category-icons";
import { toNumber } from "@/lib/money";

export const CREDIT_CARD_CATEGORY = "Credit Card";
export const WALLET_CASHOUT_CATEGORY = "Wallet cashout";
export const CARD_FEES_CATEGORY = "Card fees";
export const BANK_CHARGES_CATEGORY = "Bank charges";

export async function ensureCardCashflowCategories(userId: string) {
  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));
  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));

  async function ensure(
    name: string,
    kind: "expense" | "income",
    sortOrder: number,
  ) {
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

  const creditCard = await ensure(CREDIT_CARD_CATEGORY, "expense", 53);
  const cardFees = await ensure(CARD_FEES_CATEGORY, "expense", 54);
  const bankCharges = await ensure(BANK_CHARGES_CATEGORY, "expense", 55);
  const walletCashout = await ensure(WALLET_CASHOUT_CATEGORY, "income", 113);

  return {
    creditCardCategoryId: creditCard.id,
    cardFeesCategoryId: cardFees.id,
    bankChargesCategoryId: bankCharges.id,
    walletCashoutCategoryId: walletCashout.id,
  };
}

export async function adjustCardOutstanding(
  userId: string,
  cardId: string,
  delta: number,
) {
  if (!delta) return;
  const [card] = await db
    .select({ currentOutstanding: creditCards.currentOutstanding })
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, userId)))
    .limit(1);
  if (!card) return;
  const next = Math.max(0, toNumber(card.currentOutstanding) + delta);
  await db
    .update(creditCards)
    .set({ currentOutstanding: next.toFixed(2) })
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, userId)));
}

export async function setCardOutstanding(
  userId: string,
  cardId: string,
  amount: number,
) {
  await db
    .update(creditCards)
    .set({
      currentOutstanding: Math.max(0, amount).toFixed(2),
    })
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, userId)));
}

/** Reverse outstanding for activities linked to a transaction, then delete them. */
export async function reverseActivitiesForTransaction(
  userId: string,
  transactionId: string,
) {
  const rows = await db
    .select()
    .from(cardActivities)
    .where(
      and(
        eq(cardActivities.userId, userId),
        eq(cardActivities.transactionId, transactionId),
      ),
    );

  const related = await db
    .select()
    .from(cardActivities)
    .where(
      and(
        eq(cardActivities.userId, userId),
        eq(cardActivities.relatedTransactionId, transactionId),
      ),
    );

  const all = [...rows, ...related];
  const seen = new Set<string>();
  for (const row of all) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const delta = Number(row.outstandingDelta) || 0;
    if (delta) {
      await adjustCardOutstanding(userId, row.cardId, -delta);
    }
    await db
      .delete(cardActivities)
      .where(and(eq(cardActivities.id, row.id), eq(cardActivities.userId, userId)));
  }
}

export async function recordSpendOnCard(args: {
  userId: string;
  cardId: string;
  date: string;
  amount: number;
  description: string;
  transactionId: string;
}) {
  await db.insert(cardActivities).values({
    userId: args.userId,
    cardId: args.cardId,
    date: args.date,
    activityType: "spend",
    amount: args.amount.toFixed(2),
    outstandingDelta: args.amount.toFixed(2),
    description: args.description || "Card spend",
    transactionId: args.transactionId,
  });
  await adjustCardOutstanding(args.userId, args.cardId, args.amount);
}

export async function deleteLinkedCashflowTx(
  userId: string,
  transactionId: string | null | undefined,
) {
  if (!transactionId) return;
  const { reverseBankBalanceForTransaction } = await import(
    "@/lib/bank-account-cashflow"
  );
  await reverseBankBalanceForTransaction(userId, transactionId);
  await db
    .delete(transactions)
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
    );
}
