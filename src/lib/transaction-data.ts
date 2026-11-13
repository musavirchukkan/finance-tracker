import { and, desc, eq, exists, gte, lt, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  TRANSACTIONS_MAX_PAGE_SIZE,
  TRANSACTIONS_PAGE_SIZE,
  TRANSACTIONS_UNBOUNDED_CAP,
} from "@/lib/constants";
import { db } from "@/lib/db";
import {
  bankAccounts,
  cardActivities,
  categories,
  creditCards,
  transactions,
} from "@/lib/db/schema";
import { formatCardLabel } from "@/lib/credit-cards";
import { toNumber } from "@/lib/money";
import { monthDateBounds } from "@/lib/months";
import { assertOwnedTransactionInputs } from "@/lib/ownership";
import { UserFacingError } from "@/lib/safe-error";
import { parseUtcInstant } from "@/lib/utc-time";

/** Day-level SUM for charts — avoids loading every transaction row. */
export async function getMonthlyCashflowByDay(
  userId: string,
  yearMonth: string,
) {
  const { start, end } = monthDateBounds(yearMonth);
  const rows = await db
    .select({
      date: transactions.date,
      type: transactions.type,
      total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, start),
        lte(transactions.date, end),
      ),
    )
    .groupBy(transactions.date, transactions.type);

  return rows
    .filter((r) => r.type === "income" || r.type === "expense")
    .map((r) => ({
      date: String(r.date),
      type: r.type as "income" | "expense",
      total: toNumber(r.total),
    }));
}

function encodeTxCursor(occurredAt: Date | string, id: string) {
  const iso =
    occurredAt instanceof Date
      ? occurredAt.toISOString()
      : new Date(occurredAt).toISOString();
  return Buffer.from(`${iso}|${id}`, "utf8").toString("base64url");
}

function decodeTxCursor(
  cursor: string,
): { occurredAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [iso, id] = raw.split("|");
    if (!iso || !id) return null;
    const occurredAt = new Date(iso);
    if (Number.isNaN(occurredAt.getTime())) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

export async function listTransactions(
  userId: string,
  yearMonth?: string,
  opts?: {
    type?: "income" | "expense" | "transfer" | "all";
    categoryId?: string;
    /** Bank as From or To (UPI/POS/income/transfer/bill pay). */
    bankAccountId?: string;
    /** Card spend or linked card-activity cashflow tx (bill/fee/wallet). */
    creditCardId?: string;
    page?: number;
    pageSize?: number;
    /** Keyset cursor (preferred for large lists). Mutually exclusive with page. */
    cursor?: string;
  },
) {
  const conditions = [eq(transactions.userId, userId)];
  if (yearMonth) {
    const { start, end } = monthDateBounds(yearMonth);
    conditions.push(gte(transactions.date, start));
    conditions.push(lte(transactions.date, end));
  }
  if (
    opts?.type === "income" ||
    opts?.type === "expense" ||
    opts?.type === "transfer"
  ) {
    conditions.push(eq(transactions.type, opts.type));
  }
  if (opts?.categoryId) {
    conditions.push(eq(transactions.categoryId, opts.categoryId));
  }
  if (opts?.bankAccountId) {
    conditions.push(
      or(
        eq(transactions.bankAccountId, opts.bankAccountId),
        eq(transactions.transferToBankAccountId, opts.bankAccountId),
      )!,
    );
  }
  if (opts?.creditCardId) {
    conditions.push(
      or(
        eq(transactions.creditCardId, opts.creditCardId),
        exists(
          db
            .select({ id: cardActivities.id })
            .from(cardActivities)
            .where(
              and(
                eq(cardActivities.userId, userId),
                eq(cardActivities.cardId, opts.creditCardId),
                or(
                  eq(cardActivities.transactionId, transactions.id),
                  eq(cardActivities.relatedTransactionId, transactions.id),
                )!,
              ),
            ),
        ),
      )!,
    );
  }

  const useCursor = Boolean(opts?.cursor);
  const paginate =
    useCursor || opts?.page != null || opts?.pageSize != null;
  // Always bound results — never return an unbounded full-table dump (H5).
  const pageSize = paginate
    ? Math.min(
        TRANSACTIONS_MAX_PAGE_SIZE,
        Math.max(1, opts?.pageSize ?? TRANSACTIONS_PAGE_SIZE),
      )
    : TRANSACTIONS_UNBOUNDED_CAP;
  const page = !useCursor && paginate ? Math.max(1, opts?.page ?? 1) : 1;
  const offset =
    !useCursor && paginate ? (page - 1) * pageSize : 0;

  if (useCursor && opts?.cursor) {
    const decoded = decodeTxCursor(opts.cursor);
    if (decoded) {
      conditions.push(
        or(
          lt(transactions.occurredAt, decoded.occurredAt),
          and(
            eq(transactions.occurredAt, decoded.occurredAt),
            lt(transactions.id, decoded.id),
          ),
        )!,
      );
    }
  }

  const where = and(...conditions);

  const spendCard = alias(creditCards, "spend_card");
  const billCard = alias(creditCards, "bill_card");
  const billActivity = alias(cardActivities, "bill_activity");
  const transferToBank = alias(bankAccounts, "transfer_to_bank");

  const listQuery = db
    .select({
      id: transactions.id,
      date: transactions.date,
      occurredAt: transactions.occurredAt,
      description: transactions.description,
      amount: transactions.amount,
      type: transactions.type,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryKind: categories.kind,
      creditCardId: transactions.creditCardId,
      creditCardName: spendCard.name,
      creditCardLastFour: spendCard.lastFour,
      bankAccountId: transactions.bankAccountId,
      bankAccountName: bankAccounts.name,
      transferToBankAccountId: transactions.transferToBankAccountId,
      transferToBankAccountName: transferToBank.name,
      billPayCardId: billCard.id,
      billPayCardName: billCard.name,
      billPayCardLastFour: billCard.lastFour,
    })
    .from(transactions)
    .innerJoin(
      categories,
      and(
        eq(transactions.categoryId, categories.id),
        eq(categories.userId, userId),
      ),
    )
    .leftJoin(
      spendCard,
      and(
        eq(transactions.creditCardId, spendCard.id),
        eq(spendCard.userId, userId),
      ),
    )
    .leftJoin(
      bankAccounts,
      and(
        eq(transactions.bankAccountId, bankAccounts.id),
        eq(bankAccounts.userId, userId),
      ),
    )
    .leftJoin(
      transferToBank,
      and(
        eq(transactions.transferToBankAccountId, transferToBank.id),
        eq(transferToBank.userId, userId),
      ),
    )
    .leftJoin(
      billActivity,
      and(
        eq(billActivity.transactionId, transactions.id),
        eq(billActivity.activityType, "bill_payment"),
        eq(billActivity.userId, userId),
      ),
    )
    .leftJoin(
      billCard,
      and(eq(billActivity.cardId, billCard.id), eq(billCard.userId, userId)),
    )
    .where(where)
    .orderBy(desc(transactions.occurredAt), desc(transactions.id));

  // Cursor pages skip COUNT(*) (expensive on large tables).
  const [countRow, rawRows] = await Promise.all([
    useCursor
      ? Promise.resolve([{ count: -1 }])
      : db
          .select({ count: sql<number>`count(*)::int` })
          .from(transactions)
          .where(where),
    pageSize != null
      ? useCursor
        ? listQuery.limit(pageSize + 1)
        : listQuery.limit(pageSize).offset(offset)
      : listQuery,
  ]);

  const total = Number(countRow[0]?.count ?? 0);
  let slice = rawRows;
  let nextCursor: string | null = null;
  if (useCursor && pageSize != null && rawRows.length > pageSize) {
    slice = rawRows.slice(0, pageSize);
    const last = slice[slice.length - 1];
    nextCursor = encodeTxCursor(last.occurredAt, last.id);
  } else if (useCursor && slice.length > 0) {
    nextCursor = null;
  }

  const mapped = slice.map((row) => ({
    ...row,
    creditCardName: row.creditCardName
      ? formatCardLabel(row.creditCardName, row.creditCardLastFour)
      : null,
    billPayCardName: row.billPayCardName
      ? formatCardLabel(row.billPayCardName, row.billPayCardLastFour)
      : null,
  }));

  return {
    rows: mapped,
    total: useCursor ? mapped.length : total,
    page,
    pageSize: pageSize ?? mapped.length,
    totalPages:
      useCursor || !pageSize
        ? 1
        : Math.max(1, Math.ceil(total / pageSize)),
    nextCursor,
  };
}

/** Shared insert used by server actions and offline sync API. */
export async function insertTransactionForUser(
  userId: string,
  input: {
    date: string;
    description: string;
    categoryId: string;
    type: "expense" | "income" | "transfer";
    amount: number;
    occurredAt?: string;
    clientId?: string;
    creditCardId?: string | null;
    /** Pay down card outstanding (bill payment), not a new card spend. */
    cardBillPayId?: string | null;
    bankAccountId?: string | null;
    transferToBankAccountId?: string | null;
    /** Audit trail source; defaults to api when omitted from shared insert. */
    activitySource?: "server_action" | "api" | "offline_sync";
  },
): Promise<{ id: string; duplicate: boolean }> {
  const activitySource = input.activitySource ?? "api";
  // Idempotent offline sync: same clientId → return existing, don't insert again
  if (input.clientId) {
    const existing = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.clientId, input.clientId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return { id: existing[0].id, duplicate: true };
    }
  }

  const parsedInstant = input.occurredAt
    ? parseUtcInstant(input.occurredAt)
    : new Date();
  // `occurredAt` is the UTC instant. `date` is the calendar day the user
  // picked in their own timezone, so month filters match what they see.
  const occurredAt = Number.isNaN(parsedInstant.getTime())
    ? new Date()
    : parsedInstant;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? input.date
    : occurredAt.toISOString().slice(0, 10);

  const isTransfer = input.type === "transfer";
  if (!(input.amount > 0)) {
    throw new UserFacingError("Enter a positive amount");
  }

  let categoryId = input.categoryId;
  let cardBillPayId: string | null = null;
  let creditCardId: string | null = null;
  let bankAccountId: string | null = null;
  let transferToBankAccountId: string | null = null;

  if (isTransfer) {
    const {
      ensureTransferCategory,
      normalizeTransferLegs,
      applyTransferBalances,
    } = await import("@/lib/bank-account-cashflow");
    categoryId = await ensureTransferCategory(userId);
    const legs = normalizeTransferLegs({
      fromBankAccountId: input.bankAccountId,
      toBankAccountId: input.transferToBankAccountId,
      amount: input.amount,
    });
    bankAccountId = legs.fromBankAccountId;
    transferToBankAccountId = legs.toBankAccountId;

    await assertOwnedTransactionInputs(userId, {
      categoryId,
      bankAccountId,
      transferToBankAccountId,
    });

    const transferOccurredAt = Number.isNaN(occurredAt.getTime())
      ? new Date()
      : occurredAt;

    try {
      const [row] = await db
        .insert(transactions)
        .values({
          userId,
          date: dateOnly,
          occurredAt: transferOccurredAt,
          description: input.description,
          categoryId,
          type: "transfer",
          amount: input.amount.toFixed(2),
          creditCardId: null,
          bankAccountId,
          transferToBankAccountId,
          clientId: input.clientId ?? null,
        })
        .returning();

      await applyTransferBalances({
        userId,
        fromBankAccountId: bankAccountId,
        toBankAccountId: transferToBankAccountId,
        amount: input.amount,
        occurredAt: transferOccurredAt,
      });

      const {
        recordActivityEvent,
        summarizeTransactionActivity,
        transactionActivitySnapshot,
      } = await import("@/lib/activity-log");
      const after = transactionActivitySnapshot({
        type: "transfer",
        amount: input.amount,
        date: dateOnly,
        occurredAt: transferOccurredAt,
        description: input.description,
        categoryId,
        bankAccountId,
        transferToBankAccountId,
      });
      await recordActivityEvent({
        userId,
        action: "transaction.create",
        entityType: "transaction",
        entityId: row.id,
        summary: summarizeTransactionActivity({
          verb: "Created",
          snapshot: after,
        }),
        after,
        source: activitySource,
      });

      return { id: row.id, duplicate: false };
    } catch (err) {
      if (input.clientId) {
        const again = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.clientId, input.clientId),
            ),
          )
          .limit(1);
        if (again[0]) return { id: again[0].id, duplicate: true };
      }
      throw err;
    }
  }

  cardBillPayId =
    input.type === "expense" && input.cardBillPayId
      ? input.cardBillPayId
      : null;
  creditCardId =
    input.type === "expense" && input.creditCardId && !cardBillPayId
      ? input.creditCardId
      : null;
  // Bill pay may also debit a bank account; card spend may not.
  bankAccountId =
    creditCardId || !input.bankAccountId ? null : input.bankAccountId;

  await assertOwnedTransactionInputs(userId, {
    categoryId,
    creditCardId,
    cardBillPayId,
    bankAccountId,
  });

  const txOccurredAt = Number.isNaN(occurredAt.getTime())
    ? new Date()
    : occurredAt;

  try {
    const [row] = await db
      .insert(transactions)
      .values({
        userId,
        date: dateOnly,
        occurredAt: txOccurredAt,
        description: input.description,
        categoryId,
        type: input.type,
        amount: input.amount.toFixed(2),
        creditCardId,
        bankAccountId,
        transferToBankAccountId: null,
        clientId: input.clientId ?? null,
      })
      .returning();

    if (creditCardId && input.amount > 0) {
      const { recordSpendOnCard } = await import("@/lib/credit-card-cashflow");
      await recordSpendOnCard({
        userId,
        cardId: creditCardId,
        date: dateOnly,
        amount: input.amount,
        description: input.description,
        transactionId: row.id,
      });
    } else if (cardBillPayId && input.amount > 0) {
      const { recordBillPaymentOnCard } = await import(
        "@/lib/credit-card-cashflow"
      );
      await recordBillPaymentOnCard({
        userId,
        cardId: cardBillPayId,
        date: dateOnly,
        amount: input.amount,
        description: input.description || "Bill payment",
        transactionId: row.id,
      });
    }

    if (bankAccountId && input.amount > 0) {
      const { applyBankBalanceForTransaction } = await import(
        "@/lib/bank-account-cashflow"
      );
      await applyBankBalanceForTransaction({
        userId,
        bankAccountId,
        type: input.type === "income" ? "income" : "expense",
        amount: input.amount,
        occurredAt: txOccurredAt,
      });
    }

    const {
      recordActivityEvent,
      summarizeTransactionActivity,
      transactionActivitySnapshot,
    } = await import("@/lib/activity-log");
    const after = transactionActivitySnapshot({
      type: input.type,
      amount: input.amount,
      date: dateOnly,
      occurredAt: txOccurredAt,
      description: input.description,
      categoryId,
      bankAccountId,
      transferToBankAccountId: null,
      creditCardId,
      cardBillPayId,
    });
    await recordActivityEvent({
      userId,
      action: "transaction.create",
      entityType: "transaction",
      entityId: row.id,
      summary: summarizeTransactionActivity({
        verb: "Created",
        snapshot: after,
      }),
      after,
      source: activitySource,
    });

    return { id: row.id, duplicate: false };
  } catch (err) {
    // Race: another sync already inserted this clientId
    if (input.clientId) {
      const again = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.clientId, input.clientId),
          ),
        )
        .limit(1);
      if (again[0]) return { id: again[0].id, duplicate: true };
    }
    throw err;
  }
}
