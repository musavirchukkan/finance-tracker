import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankAccounts, transactions } from "@/lib/db/schema";
import { formatCardLabel } from "@/lib/credit-cards";
import { toNumber } from "@/lib/money";

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
        eq(transactions.bankAccountId, id),
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

