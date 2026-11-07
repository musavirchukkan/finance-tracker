import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cache } from "react";
import { db } from "@/lib/db";
import {
  creditCards,
  debtAccounts,
  debtPayments,
} from "@/lib/db/schema";
import {
  computeOutstanding,
  isCreditCardType,
} from "@/lib/debt-kinds";
import { postLinkedEmisForUser } from "@/lib/emi-statement-post";
import { toNumber } from "@/lib/money";

function revalidateCards(cardId?: string) {
  revalidatePath("/cards");
  if (cardId) revalidatePath(`/cards/${cardId}`);
  revalidatePath("/transactions");
  revalidatePath("/overview");
  revalidatePath("/budget");
  revalidatePath("/debt");
  revalidatePath("/quick-add");
}

export async function migrateRollingCreditCards(userId: string) {
  const debtRows = await db
    .select()
    .from(debtAccounts)
    .where(eq(debtAccounts.userId, userId));

  const rolling = debtRows.filter((a) => isCreditCardType(a.type));
  if (rolling.length === 0) return { migrated: 0 };

  const payments = await db
    .select()
    .from(debtPayments)
    .where(eq(debtPayments.userId, userId));

  let migrated = 0;
  for (const account of rolling) {
    const accountPayments = payments.filter((p) => p.accountId === account.id);
    const outstanding = computeOutstanding({
      startingBalance: toNumber(account.startingBalance),
      payments: accountPayments.map((p) => ({
        amount: toNumber(p.amount),
        isPaid: p.isPaid,
        paymentType: p.paymentType,
      })),
    });

    const existing = await db
      .select({ id: creditCards.id })
      .from(creditCards)
      .where(
        and(eq(creditCards.userId, userId), eq(creditCards.name, account.name)),
      )
      .limit(1);

    if (!existing[0]) {
      await db.insert(creditCards).values({
        userId,
        name: account.name,
        currentOutstanding: outstanding.toFixed(2),
        status: account.status || "Active",
      });
      migrated += 1;
    }

    for (const p of accountPayments) {
      if (p.transactionId) {
        await db
          .update(debtPayments)
          .set({ transactionId: null })
          .where(eq(debtPayments.id, p.id));
      }
    }
    await db
      .delete(debtPayments)
      .where(
        and(
          eq(debtPayments.accountId, account.id),
          eq(debtPayments.userId, userId),
        ),
      );
    await db
      .update(debtAccounts)
      .set({ receivedTransactionId: null, updatedAt: new Date() })
      .where(
        and(eq(debtAccounts.id, account.id), eq(debtAccounts.userId, userId)),
      );
    await db
      .delete(debtAccounts)
      .where(
        and(eq(debtAccounts.id, account.id), eq(debtAccounts.userId, userId)),
      );
  }

  if (migrated > 0) revalidateCards();
  return { migrated };
}

/**
 * Side effects (legacy migrate + EMI post) — once per RSC request via cache.
 * Keep list/detail/dashboard reads pure (H4).
 */
export const ensureCardLedgerSynced = cache(async (userId: string) => {
  await migrateRollingCreditCards(userId);
  await postLinkedEmisForUser(userId);
});
