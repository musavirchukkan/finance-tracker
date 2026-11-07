import { and, asc, desc, eq, or } from "drizzle-orm";
import { cache } from "react";
import { cacheGetOrSetJson } from "@/lib/cache";
import { db } from "@/lib/db";
import { bankAccounts, transactions } from "@/lib/db/schema";
import { formatCardLabel } from "@/lib/credit-cards";
import { toNumber } from "@/lib/money";
import { REF_CACHE_TTL_SEC, RefCacheKeys } from "@/lib/ref-cache";

export type BankAccountOption = {
  id: string;
  name: string;
  lastFour: string | null;
  label: string;
};

/** Dropdown-shaped banks (no balances). Redis when configured. */
export const listBankAccountOptions = cache(async (userId: string) => {
  return cacheGetOrSetJson<BankAccountOption[]>(
    RefCacheKeys.bankOptions(userId),
    REF_CACHE_TTL_SEC,
    async () => {
      const rows = await db
        .select({
          id: bankAccounts.id,
          name: bankAccounts.name,
          lastFour: bankAccounts.lastFour,
        })
        .from(bankAccounts)
        .where(eq(bankAccounts.userId, userId))
        .orderBy(asc(bankAccounts.name));

      return rows.map((a) => ({
        ...a,
        label: formatCardLabel(a.name, a.lastFour),
      }));
    },
  );
});

/** Full bank rows including balances — not Redis-cached. */
export async function listBankAccounts(userId: string) {
  const rows = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.userId, userId))
    .orderBy(asc(bankAccounts.name));

  return rows.map((a) => ({
    ...a,
    balanceNum: toNumber(a.currentBalance),
    minBalanceNum:
      a.minBalance != null && a.minBalance !== ""
        ? toNumber(a.minBalance)
        : null,
    label: formatCardLabel(a.name, a.lastFour),
  }));
}

export async function getBankAccountDetail(userId: string, id: string) {
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)))
    .limit(1);
  if (!account) return null;

  const txs = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        or(
          eq(transactions.bankAccountId, id),
          eq(transactions.transferToBankAccountId, id),
        ),
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.occurredAt))
    .limit(50);

  return {
    account: {
      ...account,
      balanceNum: toNumber(account.currentBalance),
      minBalanceNum:
        account.minBalance != null && account.minBalance !== ""
          ? toNumber(account.minBalance)
          : null,
      label: formatCardLabel(account.name, account.lastFour),
    },
    transactions: txs,
  };
}

