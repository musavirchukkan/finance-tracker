"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { bankAccounts, transactions } from "@/lib/db/schema";
import { formString, zNonEmpty } from "@/lib/form-schemas";
import { normalizeLastFour } from "@/lib/credit-cards";
import { parseAmount } from "@/lib/money";
import { UserFacingError } from "@/lib/safe-error";
import { requireUser } from "@/lib/session";

function revalidateBanks(accountId?: string) {
  revalidatePath("/accounts");
  if (accountId) revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/transactions");
  revalidatePath("/overview");
  revalidatePath("/quick-add");
  revalidatePath("/cards");
}

function parseBankExtras(formData: FormData) {
  const minRaw = String(formData.get("minBalance") ?? "").trim();
  const minBalance = minRaw ? parseAmount(minRaw) : null;
  const balanceRules =
    String(formData.get("balanceRules") ?? "").trim() || null;
  const lastFour = normalizeLastFour(String(formData.get("lastFour") ?? ""));
  return { minBalance, balanceRules, lastFour };
}

const bankUpsertSchema = z.object({
  name: zNonEmpty,
  currentBalance: z.string(),
  accountType: z.string().trim().default("Savings"),
  status: z.string().trim().default("Active"),
});

export async function createBankAccount(formData: FormData) {
  const user = await requireUser();
  const parsed = bankUpsertSchema.safeParse({
    name: formString(formData, "name"),
    currentBalance: formString(formData, "currentBalance") || "0",
    accountType: formString(formData, "accountType") || "Savings",
    status: formString(formData, "status") || "Active",
  });
  if (!parsed.success) {
    throw new UserFacingError(
      parsed.error.issues[0]?.message ?? "Invalid account details",
    );
  }

  const currentBalance = parseAmount(parsed.data.currentBalance, {
    allowNegative: true,
  });
  const { minBalance, balanceRules, lastFour } = parseBankExtras(formData);

  const [row] = await db
    .insert(bankAccounts)
    .values({
      userId: user.id,
      name: parsed.data.name,
      currentBalance: currentBalance.toFixed(2),
      minBalance: minBalance != null ? minBalance.toFixed(2) : null,
      balanceRules,
      lastFour,
      accountType: parsed.data.accountType || "Savings",
      status: parsed.data.status || "Active",
    })
    .returning();

  revalidateBanks(row.id);
}

export async function updateBankAccount(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id").trim();
  const parsed = bankUpsertSchema.safeParse({
    name: formString(formData, "name"),
    currentBalance: formString(formData, "currentBalance") || "0",
    accountType: formString(formData, "accountType") || "Savings",
    status: formString(formData, "status") || "Active",
  });
  if (!id || !parsed.success) {
    throw new UserFacingError("Missing fields");
  }

  const currentBalance = parseAmount(parsed.data.currentBalance, {
    allowNegative: true,
  });
  const { minBalance, balanceRules, lastFour } = parseBankExtras(formData);

  await db
    .update(bankAccounts)
    .set({
      name: parsed.data.name,
      currentBalance: currentBalance.toFixed(2),
      minBalance: minBalance != null ? minBalance.toFixed(2) : null,
      balanceRules,
      lastFour,
      accountType: parsed.data.accountType || "Savings",
      status: parsed.data.status || "Active",
    })
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, user.id)));

  revalidateBanks(id);
}

export async function deleteBankAccount(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id").trim();
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
  const id = formString(formData, "id").trim();
  const amount = parseAmount(formString(formData, "amount") || "0");
  const direction =
    formString(formData, "direction") === "debit" ? "debit" : "credit";

  if (!id) throw new UserFacingError("Missing account");
  if (amount <= 0) throw new UserFacingError("Enter an amount");

  const delta = direction === "credit" ? amount : -amount;
  const { adjustBankBalance } = await import("@/lib/bank-account-cashflow");
  await adjustBankBalance(user.id, id, delta);
  revalidateBanks(id);
}
