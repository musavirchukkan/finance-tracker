"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { bankAccounts, transactions } from "@/lib/db/schema";
import {
  applyBankBalanceForTransaction,
  reverseBankBalanceForTransaction,
} from "@/lib/bank-account-cashflow";
import { formatCardLabel, normalizeLastFour } from "@/lib/credit-cards";
import { parseAmount, toNumber } from "@/lib/money";
import { requireUser } from "@/lib/session";

function revalidateBanks(accountId?: string) {
  revalidatePath("/accounts");
  if (accountId) revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/transactions");
  revalidatePath("/overview");
  revalidatePath("/quick-add");
  revalidatePath("/cards");
}

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

function parseBankExtras(formData: FormData) {
  const minRaw = String(formData.get("minBalance") ?? "").trim();
  const minBalance = minRaw ? parseAmount(minRaw) : null;
  const balanceRules =
    String(formData.get("balanceRules") ?? "").trim() || null;
  const lastFour = normalizeLastFour(String(formData.get("lastFour") ?? ""));
  return { minBalance, balanceRules, lastFour };
}

export async function createBankAccount(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const currentBalance = parseAmount(
    String(formData.get("currentBalance") ?? "0"),
  );
  const accountType =
    String(formData.get("accountType") ?? "Savings").trim() || "Savings";
  const status = String(formData.get("status") ?? "Active").trim() || "Active";
  const { minBalance, balanceRules, lastFour } = parseBankExtras(formData);

  if (!name) throw new Error("Name is required");

  const [row] = await db
    .insert(bankAccounts)
    .values({
      userId: user.id,
      name,
      currentBalance: currentBalance.toFixed(2),
      minBalance: minBalance != null ? minBalance.toFixed(2) : null,
      balanceRules,
      lastFour,
      accountType,
      status,
    })
    .returning();

  revalidateBanks(row.id);
}

export async function updateBankAccount(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const currentBalance = parseAmount(
    String(formData.get("currentBalance") ?? "0"),
  );
  const accountType =
    String(formData.get("accountType") ?? "Savings").trim() || "Savings";
  const status = String(formData.get("status") ?? "Active").trim() || "Active";
  const { minBalance, balanceRules, lastFour } = parseBankExtras(formData);

  if (!id || !name) throw new Error("Missing fields");

  await db
    .update(bankAccounts)
    .set({
      name,
      currentBalance: currentBalance.toFixed(2),
      minBalance: minBalance != null ? minBalance.toFixed(2) : null,
      balanceRules,
      lastFour,
      accountType,
      status,
    })
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, user.id)));

  revalidateBanks(id);
}

export async function deleteBankAccount(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db
    .update(transactions)
    .set({ bankAccountId: null })
    .where(
      and(eq(transactions.bankAccountId, id), eq(transactions.userId, user.id)),
    );

  await db
    .delete(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, user.id)));

  revalidateBanks();
}

export async function adjustBankAccountBalance(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "0"));
  const direction =
    String(formData.get("direction") ?? "credit") === "debit"
      ? "debit"
      : "credit";

  if (!id) throw new Error("Missing account");
  if (amount <= 0) throw new Error("Enter an amount");

  const delta = direction === "credit" ? amount : -amount;
  const { adjustBankBalance } = await import("@/lib/bank-account-cashflow");
  await adjustBankBalance(user.id, id, delta);
  revalidateBanks(id);
}

/** Re-export helpers used when deleting linked cashflow txs. */
export { reverseBankBalanceForTransaction, applyBankBalanceForTransaction };
