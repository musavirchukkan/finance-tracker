"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WRITE_RATE_LIMIT } from "@/lib/constants";
import { db } from "@/lib/db";
import { bankAccounts, transactions } from "@/lib/db/schema";
import {
  formString,
  parseOrThrow,
  zNonEmpty,
  zUuid,
} from "@/lib/form-schemas";
import { normalizeLastFour } from "@/lib/credit-cards";
import { parseAmount, toNumber } from "@/lib/money";
import { assertWriteRateLimit } from "@/lib/rate-limit";
import { invalidateBankOptionsCache } from "@/lib/ref-cache";
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

const bankExtrasSchema = z.object({
  minBalance: z.string(),
  balanceRules: z.string(),
  lastFour: z.string(),
});

function parseBankExtras(formData: FormData) {
  const raw = parseOrThrow(bankExtrasSchema, {
    minBalance: formString(formData, "minBalance"),
    balanceRules: formString(formData, "balanceRules"),
    lastFour: formString(formData, "lastFour"),
  });
  const minRaw = raw.minBalance.trim();
  const minBalance = minRaw ? parseAmount(minRaw) : null;
  const balanceRules = raw.balanceRules.trim() || null;
  const lastFour = normalizeLastFour(raw.lastFour);
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
  await assertWriteRateLimit(
    user.id,
    "write",
    WRITE_RATE_LIMIT.limit,
    WRITE_RATE_LIMIT.windowMs,
  );
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
  const { balanceAsOfNow } = await import("@/lib/bank-account-cashflow");

  const [row] = await db
    .insert(bankAccounts)
    .values({
      userId: user.id,
      name: parsed.data.name,
      currentBalance: currentBalance.toFixed(2),
      balanceAsOf: balanceAsOfNow(),
      minBalance: minBalance != null ? minBalance.toFixed(2) : null,
      balanceRules,
      lastFour,
      accountType: parsed.data.accountType || "Savings",
      status: parsed.data.status || "Active",
    })
    .returning();

  await invalidateBankOptionsCache(user.id);
  revalidateBanks(row.id);
}

export async function updateBankAccount(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(
    user.id,
    "write",
    WRITE_RATE_LIMIT.limit,
    WRITE_RATE_LIMIT.windowMs,
  );
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing fields",
  ).id;
  const parsed = bankUpsertSchema.safeParse({
    name: formString(formData, "name"),
    currentBalance: formString(formData, "currentBalance") || "0",
    accountType: formString(formData, "accountType") || "Savings",
    status: formString(formData, "status") || "Active",
  });
  if (!parsed.success) {
    throw new UserFacingError(
      parsed.error.issues[0]?.message ?? "Missing fields",
    );
  }

  const currentBalance = parseAmount(parsed.data.currentBalance, {
    allowNegative: true,
  });
  const { minBalance, balanceRules, lastFour } = parseBankExtras(formData);

  const [existing] = await db
    .select({ currentBalance: bankAccounts.currentBalance })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, user.id)))
    .limit(1);
  if (!existing) throw new UserFacingError("Account not found");

  const balanceChanged =
    toNumber(existing.currentBalance) !== currentBalance;
  const { balanceAsOfNow } = await import("@/lib/bank-account-cashflow");

  await db
    .update(bankAccounts)
    .set({
      name: parsed.data.name,
      currentBalance: currentBalance.toFixed(2),
      ...(balanceChanged ? { balanceAsOf: balanceAsOfNow() } : {}),
      minBalance: minBalance != null ? minBalance.toFixed(2) : null,
      balanceRules,
      lastFour,
      accountType: parsed.data.accountType || "Savings",
      status: parsed.data.status || "Active",
      updatedAt: new Date(),
    })
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, user.id)));

  await invalidateBankOptionsCache(user.id);
  revalidateBanks(id);
}

export async function deleteBankAccount(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(
    user.id,
    "write",
    WRITE_RATE_LIMIT.limit,
    WRITE_RATE_LIMIT.windowMs,
  );
  const idRaw = formString(formData, "id").trim();
  if (!idRaw) return;
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: idRaw },
    "Missing account",
  ).id;

  await db
    .update(transactions)
    .set({ bankAccountId: null })
    .where(
      and(eq(transactions.bankAccountId, id), eq(transactions.userId, user.id)),
    );

  await db
    .delete(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, user.id)));

  await invalidateBankOptionsCache(user.id);
  revalidateBanks();
}

const adjustBalanceSchema = z.object({
  id: zUuid,
  amount: z.string(),
  direction: z.string(),
});

export async function adjustBankAccountBalance(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(
    user.id,
    "write",
    WRITE_RATE_LIMIT.limit,
    WRITE_RATE_LIMIT.windowMs,
  );
  const raw = parseOrThrow(
    adjustBalanceSchema,
    {
      id: formString(formData, "id").trim(),
      amount: formString(formData, "amount") || "0",
      direction: formString(formData, "direction") || "credit",
    },
    "Missing account",
  );
  const amount = parseAmount(raw.amount);
  const direction = raw.direction === "debit" ? "debit" : "credit";
  if (amount <= 0) throw new UserFacingError("Enter an amount");

  const delta = direction === "credit" ? amount : -amount;
  const { adjustBankBalance } = await import("@/lib/bank-account-cashflow");
  await adjustBankBalance(user.id, raw.id, delta);
  revalidateBanks(raw.id);
}
