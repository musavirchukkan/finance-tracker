import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankAccounts, transactions } from "@/lib/db/schema";
import { toNumber } from "@/lib/money";

export async function adjustBankBalance(
  userId: string,
  accountId: string,
  delta: number,
) {
  if (!delta) return;
  const [account] = await db
    .select({ currentBalance: bankAccounts.currentBalance })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, userId)))
    .limit(1);
  if (!account) return;
  const next = toNumber(account.currentBalance) + delta;
  await db
    .update(bankAccounts)
    .set({ currentBalance: next.toFixed(2) })
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, userId)));
}

/** Balance delta for a transaction: income credits, expense debits. */
export function bankBalanceDelta(
  type: "expense" | "income",
  amount: number,
): number {
  if (!amount) return 0;
  return type === "income" ? amount : -amount;
}

export async function applyBankBalanceForTransaction(args: {
  userId: string;
  bankAccountId: string | null | undefined;
  type: "expense" | "income";
  amount: number;
}) {
  if (!args.bankAccountId || !args.amount) return;
  await adjustBankBalance(
    args.userId,
    args.bankAccountId,
    bankBalanceDelta(args.type, args.amount),
  );
}

export async function reverseBankBalanceForTransaction(
  userId: string,
  transactionId: string,
) {
  const [tx] = await db
    .select({
      bankAccountId: transactions.bankAccountId,
      type: transactions.type,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
    )
    .limit(1);
  if (!tx?.bankAccountId) return;

  const amount = toNumber(tx.amount);
  const type = tx.type === "income" ? "income" : "expense";
  // Undo prior effect
  await adjustBankBalance(
    userId,
    tx.bankAccountId,
    -bankBalanceDelta(type, amount),
  );
}
