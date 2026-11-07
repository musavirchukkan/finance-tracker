import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankAccounts, categories, transactions } from "@/lib/db/schema";
import { defaultIconForCategoryName } from "@/lib/category-icons";
import { toNumber } from "@/lib/money";
import { invalidateCategoryCache } from "@/lib/ref-cache";
import { UserFacingError } from "@/lib/safe-error";

export const TRANSFER_CATEGORY = "Transfer";

/** Truncate to whole seconds for a stable balance-as-of anchor. */
export function balanceAsOfNow(now = new Date()): Date {
  return new Date(Math.floor(now.getTime() / 1000) * 1000);
}

/**
 * Whether a transaction at `occurredAt` should move an account whose
 * absolute balance was last set at `balanceAsOf`.
 */
export function affectsBankBalance(
  occurredAt: Date,
  balanceAsOf: Date | null | undefined,
): boolean {
  if (!balanceAsOf) return true;
  return occurredAt.getTime() >= balanceAsOf.getTime();
}

async function loadBalanceAsOfByAccount(
  userId: string,
  accountIds: Iterable<string>,
): Promise<Map<string, Date>> {
  const ids = [...new Set([...accountIds].filter(Boolean))];
  const map = new Map<string, Date>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      id: bankAccounts.id,
      balanceAsOf: bankAccounts.balanceAsOf,
    })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.userId, userId), inArray(bankAccounts.id, ids)));
  for (const row of rows) {
    map.set(row.id, row.balanceAsOf);
  }
  return map;
}

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
    .set({ currentBalance: next.toFixed(2), updatedAt: new Date() })
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
  occurredAt: Date;
}) {
  if (!args.bankAccountId || !args.amount) return;
  const asOf = await loadBalanceAsOfByAccount(args.userId, [
    args.bankAccountId,
  ]);
  if (!affectsBankBalance(args.occurredAt, asOf.get(args.bankAccountId))) {
    return;
  }
  await adjustBankBalance(
    args.userId,
    args.bankAccountId,
    bankBalanceDelta(args.type, args.amount),
  );
}

/**
 * Normalize transfer legs. Amount must be positive — direction is From → To,
 * never a negative amount.
 */
export function normalizeTransferLegs(args: {
  fromBankAccountId: string | null | undefined;
  toBankAccountId: string | null | undefined;
  amount: number;
}): {
  fromBankAccountId: string | null;
  toBankAccountId: string | null;
  amount: number;
} {
  const fromBankAccountId = args.fromBankAccountId || null;
  const toBankAccountId = args.toBankAccountId || null;
  if (!(args.amount > 0)) {
    throw new UserFacingError("Enter a positive amount");
  }
  if (!fromBankAccountId && !toBankAccountId) {
    throw new UserFacingError("Choose at least one bank account");
  }
  if (fromBankAccountId && toBankAccountId && fromBankAccountId === toBankAccountId) {
    throw new UserFacingError("From and To must be different accounts");
  }
  return {
    fromBankAccountId,
    toBankAccountId,
    amount: args.amount,
  };
}

export async function ensureTransferCategory(userId: string) {
  const [existing] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.name, TRANSFER_CATEGORY),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.kind !== "transfer") {
      await db
        .update(categories)
        .set({ kind: "transfer", updatedAt: new Date() })
        .where(
          and(eq(categories.id, existing.id), eq(categories.userId, userId)),
        );
      await invalidateCategoryCache(userId);
    }
    return existing.id;
  }
  const [row] = await db
    .insert(categories)
    .values({
      userId,
      name: TRANSFER_CATEGORY,
      kind: "transfer",
      icon: defaultIconForCategoryName(TRANSFER_CATEGORY),
      sortOrder: 200,
    })
    .returning();
  await invalidateCategoryCache(userId);
  return row.id;
}

export async function applyTransferBalances(args: {
  userId: string;
  fromBankAccountId: string | null;
  toBankAccountId: string | null;
  amount: number;
  occurredAt: Date;
}) {
  const legs = normalizeTransferLegs(args);
  const asOf = await loadBalanceAsOfByAccount(args.userId, [
    legs.fromBankAccountId,
    legs.toBankAccountId,
  ].filter((id): id is string => Boolean(id)));

  if (
    legs.fromBankAccountId &&
    affectsBankBalance(args.occurredAt, asOf.get(legs.fromBankAccountId))
  ) {
    await adjustBankBalance(args.userId, legs.fromBankAccountId, -legs.amount);
  }
  if (
    legs.toBankAccountId &&
    affectsBankBalance(args.occurredAt, asOf.get(legs.toBankAccountId))
  ) {
    await adjustBankBalance(args.userId, legs.toBankAccountId, legs.amount);
  }
}

type LedgerEffectRow = {
  type: string;
  amount: number;
  bankAccountId: string | null | undefined;
  transferToBankAccountId?: string | null | undefined;
  occurredAt?: Date;
};

/** Per-account signed balance effects for a stored cashflow row. */
export function ledgerBalanceEffects(
  args: LedgerEffectRow & {
    balanceAsOfByAccount?: Map<string, Date | null | undefined>;
  },
): Map<string, number> {
  const effects = new Map<string, number>();
  const amount = args.amount;
  if (!(amount > 0)) return effects;

  if (args.type === "transfer") {
    if (args.bankAccountId) {
      effects.set(args.bankAccountId, -amount);
    }
    if (args.transferToBankAccountId) {
      effects.set(
        args.transferToBankAccountId,
        (effects.get(args.transferToBankAccountId) ?? 0) + amount,
      );
    }
  } else if (args.bankAccountId) {
    const type = args.type === "income" ? "income" : "expense";
    effects.set(args.bankAccountId, bankBalanceDelta(type, amount));
  }

  if (args.occurredAt && args.balanceAsOfByAccount) {
    for (const accountId of [...effects.keys()]) {
      if (
        !affectsBankBalance(
          args.occurredAt,
          args.balanceAsOfByAccount.get(accountId),
        )
      ) {
        effects.delete(accountId);
      }
    }
  }

  return effects;
}

/** Apply net balance changes between an old row and a new row (edit-safe). */
export async function applyLedgerBalanceTransition(args: {
  userId: string;
  from: LedgerEffectRow & { occurredAt: Date };
  to: LedgerEffectRow & { occurredAt: Date };
}) {
  const candidateIds = [
    args.from.bankAccountId,
    args.from.transferToBankAccountId,
    args.to.bankAccountId,
    args.to.transferToBankAccountId,
  ].filter((id): id is string => Boolean(id));
  const balanceAsOfByAccount = await loadBalanceAsOfByAccount(
    args.userId,
    candidateIds,
  );

  const before = ledgerBalanceEffects({
    ...args.from,
    balanceAsOfByAccount,
  });
  const after = ledgerBalanceEffects({
    ...args.to,
    balanceAsOfByAccount,
  });
  const accountIds = new Set([...before.keys(), ...after.keys()]);
  for (const accountId of accountIds) {
    const delta = (after.get(accountId) ?? 0) - (before.get(accountId) ?? 0);
    if (delta) {
      await adjustBankBalance(args.userId, accountId, delta);
    }
  }
}

export async function reverseBankBalanceForTransaction(
  userId: string,
  transactionId: string,
) {
  const [tx] = await db
    .select({
      bankAccountId: transactions.bankAccountId,
      transferToBankAccountId: transactions.transferToBankAccountId,
      type: transactions.type,
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
    )
    .limit(1);
  if (!tx) return;

  const amount = toNumber(tx.amount);
  const candidateIds = [tx.bankAccountId, tx.transferToBankAccountId].filter(
    (id): id is string => Boolean(id),
  );
  const balanceAsOfByAccount = await loadBalanceAsOfByAccount(
    userId,
    candidateIds,
  );
  const effects = ledgerBalanceEffects({
    type: tx.type,
    amount,
    bankAccountId: tx.bankAccountId,
    transferToBankAccountId: tx.transferToBankAccountId,
    occurredAt: tx.occurredAt,
    balanceAsOfByAccount,
  });
  for (const [accountId, delta] of effects) {
    await adjustBankBalance(userId, accountId, -delta);
  }
}
