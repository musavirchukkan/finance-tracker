import { and, asc, desc, eq, gte, lt, lte, or, sql } from "drizzle-orm";
import { cache } from "react";
import {
  TRANSACTIONS_MAX_PAGE_SIZE,
  TRANSACTIONS_PAGE_SIZE,
  TRANSACTIONS_UNBOUNDED_CAP,
} from "@/lib/constants";
import { db } from "@/lib/db";
import {
  bankAccounts,
  budgets,
  cardActivities,
  categories,
  creditCards,
  debtAccounts,
  debtPayments,
  debtSettings,
  savingsGoals,
  transactions,
} from "@/lib/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { toNumber } from "@/lib/money";
import { monthDateBounds, yearMonthFromDate } from "@/lib/months";
import { UserFacingError } from "@/lib/safe-error";
import { parseUtcInstant } from "@/lib/utc-time";
import {
  DEFAULT_GST_ON_INTEREST_PERCENT,
  PAID_TO_DATE_TYPE,
  computeGstOnInterest,
  computeMonthlyInterest,
  computeTotalInterest,
  isEmiPostedToCardType,
  normalizeInterestType,
  suggestInstallmentSplit,
} from "@/lib/debt-account";
import { isBudgetableCategoryName } from "@/lib/budget-categories";
import { formatCardLabel } from "@/lib/credit-cards";
import {
  computeOutstanding,
  paymentBalanceEffect,
} from "@/lib/debt-kinds";


/** Owned FK guards — call before inserts that store cross-table IDs (H8–H10). */

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

export async function getBudgetSummary(userId: string, yearMonth: string) {
  const { start: monthStart, end: monthEnd } = monthDateBounds(yearMonth);

  const [cats, budgetRows, actualRows, cashflowRows, incomeByCategory] =
    await Promise.all([
      db
        .select()
        .from(categories)
        .where(
          and(eq(categories.userId, userId), eq(categories.kind, "expense")),
        )
        .orderBy(asc(categories.sortOrder)),
      db
        .select()
        .from(budgets)
        .where(
          and(eq(budgets.userId, userId), eq(budgets.yearMonth, yearMonth)),
        ),
      db
        .select({
          categoryId: transactions.categoryId,
          total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.type, "expense"),
            gte(transactions.date, monthStart),
            lte(transactions.date, monthEnd),
          ),
        )
        .groupBy(transactions.categoryId),
      db
        .select({
          type: transactions.type,
          total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.date, monthStart),
            lte(transactions.date, monthEnd),
          ),
        )
        .groupBy(transactions.type),
      db
        .select({
          category: categories.name,
          total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.type, "income"),
            gte(transactions.date, monthStart),
            lte(transactions.date, monthEnd),
          ),
        )
        .groupBy(categories.name),
    ]);

  const budgetMap = new Map(
    budgetRows.map((b) => [b.categoryId, toNumber(b.amount)]),
  );
  const actualMap = new Map(
    actualRows.map((a) => [a.categoryId, toNumber(a.total)]),
  );

  const rows = cats
    .filter((c) => isBudgetableCategoryName(c.name))
    .map((c) => {
      const budget = budgetMap.get(c.id) ?? 0;
      const actual = actualMap.get(c.id) ?? 0;
      return {
        categoryId: c.id,
        category: c.name,
        budget,
        actual,
        difference: budget - actual,
      };
    });

  const totals = rows.reduce(
    (acc, r) => ({
      budget: acc.budget + r.budget,
      actual: acc.actual + r.actual,
      difference: acc.difference + r.difference,
    }),
    { budget: 0, actual: 0, difference: 0 },
  );

  let income = 0;
  let expense = 0;
  for (const row of cashflowRows) {
    if (row.type === "income") income = toNumber(row.total);
    else if (row.type === "expense") expense = toNumber(row.total);
  }

  return {
    rows,
    totals,
    cashflow: {
      income,
      expense,
      remaining: income - expense,
      incomeBreakdown: incomeByCategory.map((r) => ({
        name: r.category,
        value: toNumber(r.total),
      })),
    },
  };
}

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

export const listCategories = cache(
  async (userId: string, kind?: "expense" | "income") => {
    const conditions = [eq(categories.userId, userId)];
    if (kind) conditions.push(eq(categories.kind, kind));

    return db
      .select()
      .from(categories)
      .where(and(...conditions))
      .orderBy(asc(categories.sortOrder));
  },
);

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

/** Pure read — call `ensureCardLedgerSynced` when migrate must run first (H4). */
export async function getDebtDashboard(userId: string) {
  const [accounts, payments, settingsRows] = await Promise.all([
    db
      .select()
      .from(debtAccounts)
      .where(eq(debtAccounts.userId, userId))
      .orderBy(asc(debtAccounts.name)),
    db
      .select({
        id: debtPayments.id,
        accountId: debtPayments.accountId,
        accountName: debtAccounts.name,
        dueDate: debtPayments.dueDate,
        paymentType: debtPayments.paymentType,
        amount: debtPayments.amount,
        principalAmount: debtPayments.principalAmount,
        interestAmount: debtPayments.interestAmount,
        gstAmount: debtPayments.gstAmount,
        isPaid: debtPayments.isPaid,
      })
      .from(debtPayments)
      .innerJoin(
        debtAccounts,
        and(
          eq(debtPayments.accountId, debtAccounts.id),
          eq(debtAccounts.userId, userId),
        ),
      )
      .where(eq(debtPayments.userId, userId))
      .orderBy(desc(debtPayments.dueDate)),
    db
      .select()
      .from(debtSettings)
      .where(eq(debtSettings.userId, userId))
      .limit(1),
  ]);
  const [settings] = settingsRows;

  const paydownByAccount = new Map<string, number>();
  const chargeByAccount = new Map<string, number>();
  const paidToDateByAccount = new Map<string, number>();
  const paymentsByAccount = new Map<
    string,
    {
      amount: number;
      isPaid: boolean;
      paymentType: string;
      principalAmount: number | null;
    }[]
  >();

  for (const p of payments) {
    const amount = toNumber(p.amount);
    const principalAmount =
      p.principalAmount != null ? toNumber(p.principalAmount) : null;
    const list = paymentsByAccount.get(p.accountId) ?? [];
    list.push({
      amount,
      isPaid: p.isPaid,
      paymentType: p.paymentType,
      principalAmount,
    });
    paymentsByAccount.set(p.accountId, list);

    if (!p.isPaid) continue;
    const effect = paymentBalanceEffect(p.paymentType);
    const paydownCredit =
      principalAmount != null ? principalAmount : amount;
    if (effect === "paydown") {
      paydownByAccount.set(
        p.accountId,
        (paydownByAccount.get(p.accountId) ?? 0) + paydownCredit,
      );
    } else if (effect === "charge") {
      chargeByAccount.set(
        p.accountId,
        (chargeByAccount.get(p.accountId) ?? 0) + amount,
      );
    }
    if (p.paymentType === PAID_TO_DATE_TYPE) {
      paidToDateByAccount.set(
        p.accountId,
        (paidToDateByAccount.get(p.accountId) ?? 0) + paydownCredit,
      );
    }
  }

  const nextUnpaidDueByAccount = new Map<string, string>();
  for (const p of payments) {
    if (p.isPaid) continue;
    if (isEmiPostedToCardType(p.paymentType)) continue;
    const cur = nextUnpaidDueByAccount.get(p.accountId);
    if (!cur || p.dueDate < cur) {
      nextUnpaidDueByAccount.set(p.accountId, p.dueDate);
    }
  }

  const accountRows = accounts.map((a) => {
    const starting = toNumber(a.startingBalance);
    const paid = paydownByAccount.get(a.id) ?? 0;
    const charges = chargeByAccount.get(a.id) ?? 0;
    const pending = computeOutstanding({
      startingBalance: starting,
      payments: paymentsByAccount.get(a.id) ?? [],
    });
    const monthlyEmiNum = toNumber(a.monthlyEmi);
    const interestPercent = toNumber(a.interestPercent);
    const gstPercent =
      a.gstPercent != null
        ? toNumber(a.gstPercent)
        : DEFAULT_GST_ON_INTEREST_PERCENT;
    const interestType = normalizeInterestType(a.interestType);
    const split = suggestInstallmentSplit({
      remainingPrincipal: pending,
      interestPercent,
      interestType,
      emiPi: monthlyEmiNum,
      gstPercent,
      totalMonths: a.totalMonths,
      startingBalance: starting,
    });
    const flatInterest = computeMonthlyInterest({
      startingBalance: starting,
      totalMonths: a.totalMonths,
      monthlyEmi: monthlyEmiNum,
    });
    const monthlyInterest =
      interestType === "reducing" ? split.interest : flatInterest;
    const monthlyPrincipal =
      interestType === "reducing"
        ? split.principal
        : Math.max(
            0,
            Math.round((monthlyEmiNum - flatInterest) * 100) / 100,
          );
    const monthlyGst =
      interestType === "reducing"
        ? split.gst
        : computeGstOnInterest(monthlyInterest, gstPercent);
    const monthlyToPay =
      Math.round((monthlyPrincipal + monthlyInterest + monthlyGst) * 100) /
      100;
    return {
      ...a,
      startingBalanceNum: starting,
      monthlyEmiNum,
      monthlyPrincipal,
      monthlyInterest,
      monthlyGst,
      monthlyToPay,
      totalPaid: paid,
      totalCharges: charges,
      paidTillNow: paidToDateByAccount.get(a.id) ?? 0,
      pending,
      nextDueDate: nextUnpaidDueByAccount.get(a.id) ?? null,
    };
  });

  // Owes something first; then soonest unpaid due; paid-off last.
  accountRows.sort((a, b) => {
    const aOwes = a.pending > 0 || !!a.nextDueDate;
    const bOwes = b.pending > 0 || !!b.nextDueDate;
    if (aOwes !== bOwes) return aOwes ? -1 : 1;
    const aDue = a.nextDueDate;
    const bDue = b.nextDueDate;
    if (aDue && bDue && aDue !== bDue) return aDue < bDue ? -1 : 1;
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    if (a.pending > 0 !== b.pending > 0) return a.pending > 0 ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const totals = accountRows.reduce(
    (acc, a) => ({
      starting: acc.starting + a.startingBalanceNum,
      paid: acc.paid + a.totalPaid,
      pending: acc.pending + a.pending,
    }),
    { starting: 0, paid: 0, pending: 0 },
  );

  const paymentsByMonth: Record<string, number> = {};
  for (const p of payments) {
    if (!p.isPaid) continue;
    const effect = paymentBalanceEffect(p.paymentType);
    if (effect !== "paydown") continue;
    const ym = yearMonthFromDate(p.dueDate);
    paymentsByMonth[ym] = (paymentsByMonth[ym] ?? 0) + toNumber(p.amount);
  }

  // Unpaid soonest-first, then paid (newest due first).
  const sortedPayments = [...payments].sort((a, b) => {
    if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
    if (a.dueDate !== b.dueDate) {
      return a.isPaid
        ? a.dueDate > b.dueDate
          ? -1
          : 1
        : a.dueDate < b.dueDate
          ? -1
          : 1;
    }
    return a.accountName.localeCompare(b.accountName);
  });

  return {
    accounts: accountRows,
    payments: sortedPayments,
    settings,
    totals,
    paymentsByMonth,
  };
}

export async function getDebtAccountDetail(userId: string, accountId: string) {
  const data = await getDebtDashboard(userId);
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) return null;

  const payments = data.payments.filter((p) => p.accountId === accountId);
  const monthsLeft = Math.max(0, account.totalMonths - account.monthsPaid);
  const interestPercentNum = toNumber(account.interestPercent);
  const gstPercentNum =
    account.gstPercent != null
      ? toNumber(account.gstPercent)
      : DEFAULT_GST_ON_INTEREST_PERCENT;
  const interestType = normalizeInterestType(account.interestType);
  const installment = suggestInstallmentSplit({
    remainingPrincipal: account.pending,
    interestPercent: interestPercentNum,
    interestType,
    emiPi: account.monthlyEmiNum,
    gstPercent: gstPercentNum,
    totalMonths: account.totalMonths,
    startingBalance: account.startingBalanceNum,
  });
  const flatMonthlyInterest = computeMonthlyInterest({
    startingBalance: account.startingBalanceNum,
    totalMonths: account.totalMonths,
    monthlyEmi: account.monthlyEmiNum,
  });
  const monthlyInterest =
    interestType === "reducing" ? installment.interest : flatMonthlyInterest;
  const monthlyPrincipal =
    interestType === "reducing"
      ? installment.principal
      : Math.max(
          0,
          Math.round((account.monthlyEmiNum - flatMonthlyInterest) * 100) / 100,
        );
  const monthlyGst =
    interestType === "reducing"
      ? installment.gst
      : computeGstOnInterest(monthlyInterest, gstPercentNum);
  const monthlyToPay =
    Math.round((monthlyPrincipal + monthlyInterest + monthlyGst) * 100) / 100;
  const totalInterest = computeTotalInterest({
    startingBalance: account.startingBalanceNum,
    totalMonths: account.totalMonths,
    monthlyEmi: account.monthlyEmiNum,
  });

  let creditCardName: string | null = null;
  if (account.creditCardId) {
    const [card] = await db
      .select({ name: creditCards.name })
      .from(creditCards)
      .where(
        and(
          eq(creditCards.id, account.creditCardId),
          eq(creditCards.userId, userId),
        ),
      )
      .limit(1);
    creditCardName = card?.name ?? null;
  }

  return {
    account: {
      ...account,
      interestPercentNum,
      gstPercentNum,
      monthsLeft,
      monthlyPrincipal,
      monthlyInterest,
      monthlyGst,
      monthlyToPay,
      totalInterest,
      creditCardName,
    },
    payments,
  };
}

export async function listSavingsGoals(userId: string) {
  const rows = await db
    .select()
    .from(savingsGoals)
    .where(eq(savingsGoals.userId, userId))
    .orderBy(desc(savingsGoals.createdAt));

  return rows.map((g) => {
    const target = toNumber(g.targetAmount);
    const current = toNumber(g.currentAmount);
    const pct =
      target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    return {
      id: g.id,
      name: g.name,
      targetAmount: target,
      currentAmount: current,
      remaining: Math.max(0, target - current),
      pct,
      targetDate: g.targetDate,
      createdAt: g.createdAt,
    };
  });
}

