import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bankAccounts,
  categories,
  creditCards,
  debtAccounts,
} from "@/lib/db/schema";
import { UserFacingError } from "@/lib/safe-error";

/** Owned FK guards — call before inserts that store cross-table IDs. */

export async function assertOwnedBankAccount(
  userId: string,
  bankAccountId: string,
) {
  const [bank] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(
      and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.userId, userId)),
    )
    .limit(1);
  if (!bank) throw new UserFacingError("Invalid bank account");
}

export async function assertOwnedCreditCard(
  userId: string,
  creditCardId: string,
) {
  const [card] = await db
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(
      and(eq(creditCards.id, creditCardId), eq(creditCards.userId, userId)),
    )
    .limit(1);
  if (!card) throw new UserFacingError("Invalid credit card");
}

export async function assertOwnedDebtAccount(
  userId: string,
  accountId: string,
) {
  const [account] = await db
    .select({ id: debtAccounts.id })
    .from(debtAccounts)
    .where(
      and(eq(debtAccounts.id, accountId), eq(debtAccounts.userId, userId)),
    )
    .limit(1);
  if (!account) throw new UserFacingError("Invalid debt account");
}

/**
 * Ensure category + payment sources belong to this user before mutating
 * balances / card ledgers. Prevents crafted IDs from touching another
 * user's accounts (or applying side effects when the tx update matched 0 rows).
 */
export async function assertOwnedTransactionInputs(
  userId: string,
  input: {
    categoryId: string;
    creditCardId?: string | null;
    cardBillPayId?: string | null;
    bankAccountId?: string | null;
    transferToBankAccountId?: string | null;
  },
) {
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.id, input.categoryId), eq(categories.userId, userId)),
    )
    .limit(1);
  if (!cat) throw new UserFacingError("Invalid category");

  const cardIds = [input.creditCardId, input.cardBillPayId].filter(
    (id): id is string => Boolean(id),
  );
  for (const cardId of cardIds) {
    await assertOwnedCreditCard(userId, cardId);
  }

  if (input.bankAccountId) {
    await assertOwnedBankAccount(userId, input.bankAccountId);
  }
  if (input.transferToBankAccountId) {
    await assertOwnedBankAccount(userId, input.transferToBankAccountId);
  }
}
