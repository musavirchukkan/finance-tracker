"use server";

import { compare, hash } from "bcryptjs";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  budgets,
  categories,
  debtAccounts,
  debtPayments,
  debtSettings,
  savingsGoals,
  transactions,
  users,
} from "@/lib/db/schema";
import { parseAmount, toNumber } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { monthDateBounds, yearMonthFromDate } from "@/lib/months";

export async function createTransaction(formData: FormData) {
  const user = await requireUser();
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const type = String(formData.get("type") ?? "expense") === "income"
    ? "income"
    : "expense";
  const amount = parseAmount(String(formData.get("amount") ?? "0"));

  if (!date || !categoryId) {
    throw new Error("Missing required fields");
  }

  await db.insert(transactions).values({
    userId: user.id,
    date,
    description,
    categoryId,
    type,
    amount: amount.toFixed(2),
  });

  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/goals");
  revalidatePath("/quick-add");
}

export async function updateTransaction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const type = String(formData.get("type") ?? "expense") === "income"
    ? "income"
    : "expense";
  const amount = parseAmount(String(formData.get("amount") ?? "0"));

  await db
    .update(transactions)
    .set({
      date,
      description,
      categoryId,
      type,
      amount: amount.toFixed(2),
    })
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));

  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/goals");
}

export async function deleteTransaction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));

  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/goals");
}

export async function upsertBudgetAmount(formData: FormData) {
  const user = await requireUser();
  const categoryId = String(formData.get("categoryId") ?? "");
  const yearMonth = String(formData.get("yearMonth") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "0"));

  const existing = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, user.id),
        eq(budgets.categoryId, categoryId),
        eq(budgets.yearMonth, yearMonth),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(budgets)
      .set({ amount: amount.toFixed(2) })
      .where(eq(budgets.id, existing[0].id));
  } else {
    await db.insert(budgets).values({
      userId: user.id,
      categoryId,
      yearMonth,
      amount: amount.toFixed(2),
    });
  }

  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
}

export async function createDebtAccount(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const startingBalance = parseAmount(
    String(formData.get("startingBalance") ?? "0"),
  );
  const status = String(formData.get("status") ?? "Active Paydown").trim();

  if (!name || !type) throw new Error("Name and type are required");

  await db.insert(debtAccounts).values({
    userId: user.id,
    name,
    type,
    startingBalance: startingBalance.toFixed(2),
    status,
  });

  revalidatePath("/debt");
  revalidatePath("/goals");
  revalidatePath("/overview");
}

export async function updateDebtAccount(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const startingBalance = parseAmount(
    String(formData.get("startingBalance") ?? "0"),
  );
  const status = String(formData.get("status") ?? "Active Paydown").trim();

  await db
    .update(debtAccounts)
    .set({
      name,
      type,
      startingBalance: startingBalance.toFixed(2),
      status,
    })
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, user.id)));

  revalidatePath("/debt");
  revalidatePath("/goals");
  revalidatePath("/overview");
}

export async function deleteDebtAccount(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(debtAccounts)
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, user.id)));

  revalidatePath("/debt");
  revalidatePath("/goals");
  revalidatePath("/overview");
}

export async function createDebtPayment(formData: FormData) {
  const user = await requireUser();
  const accountId = String(formData.get("accountId") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const paymentType = String(formData.get("paymentType") ?? "EMI").trim();
  const amount = parseAmount(String(formData.get("amount") ?? "0"));
  const isPaid = formData.get("isPaid") === "on" || formData.get("isPaid") === "true";

  if (!accountId || !dueDate) throw new Error("Missing fields");

  await db.insert(debtPayments).values({
    userId: user.id,
    accountId,
    dueDate,
    paymentType,
    amount: amount.toFixed(2),
    isPaid,
  });

  revalidatePath("/debt");
  revalidatePath("/goals");
  revalidatePath("/overview");
}

export async function toggleDebtPaymentPaid(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const isPaid = formData.get("isPaid") === "true";

  await db
    .update(debtPayments)
    .set({ isPaid: !isPaid })
    .where(and(eq(debtPayments.id, id), eq(debtPayments.userId, user.id)));

  revalidatePath("/debt");
  revalidatePath("/goals");
  revalidatePath("/overview");
}

export async function deleteDebtPayment(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(debtPayments)
    .where(and(eq(debtPayments.id, id), eq(debtPayments.userId, user.id)));

  revalidatePath("/debt");
  revalidatePath("/goals");
  revalidatePath("/overview");
}

export async function updateDebtGoal(formData: FormData) {
  const user = await requireUser();
  const goalPayoffDate = String(formData.get("goalPayoffDate") ?? "");

  const existing = await db
    .select()
    .from(debtSettings)
    .where(eq(debtSettings.userId, user.id))
    .limit(1);

  if (existing[0]) {
    await db
      .update(debtSettings)
      .set({ goalPayoffDate })
      .where(eq(debtSettings.userId, user.id));
  } else {
    await db.insert(debtSettings).values({
      userId: user.id,
      goalPayoffDate,
    });
  }

  revalidatePath("/debt");
  revalidatePath("/goals");
  revalidatePath("/overview");
  revalidatePath("/settings");
}

export async function createCategory(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") === "income"
    ? "income"
    : "expense";
  const iconRaw = String(formData.get("icon") ?? "").trim();
  const icon = iconRaw || null;
  if (!name) throw new Error("Name required");

  const max = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(eq(categories.userId, user.id))
    .orderBy(desc(categories.sortOrder))
    .limit(1);

  await db.insert(categories).values({
    userId: user.id,
    name,
    kind,
    icon,
    sortOrder: (max[0]?.sortOrder ?? -1) + 1,
  });

  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
}

export async function updateCategory(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") === "income"
    ? "income"
    : "expense";
  const iconRaw = String(formData.get("icon") ?? "").trim();
  const icon = iconRaw || null;

  if (!id || !name) throw new Error("Missing fields");

  await db
    .update(categories)
    .set({ name, kind, icon })
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));

  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
}

export async function deleteCategory(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));

  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
}

export async function getBudgetSummary(userId: string, yearMonth: string) {
  const cats = await db
    .select()
    .from(categories)
    .where(
      and(eq(categories.userId, userId), eq(categories.kind, "expense")),
    )
    .orderBy(asc(categories.sortOrder));

  const budgetRows = await db
    .select()
    .from(budgets)
    .where(
      and(eq(budgets.userId, userId), eq(budgets.yearMonth, yearMonth)),
    );

  const { start: monthStart, end: monthEnd } = monthDateBounds(yearMonth);
  const actualRows = await db
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
    .groupBy(transactions.categoryId);

  const budgetMap = new Map(
    budgetRows.map((b) => [b.categoryId, toNumber(b.amount)]),
  );
  const actualMap = new Map(
    actualRows.map((a) => [a.categoryId, toNumber(a.total)]),
  );

  const rows = cats.map((c) => {
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

  const cashflowRows = await db
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
    .groupBy(transactions.type);

  let income = 0;
  let expense = 0;
  for (const row of cashflowRows) {
    if (row.type === "income") income = toNumber(row.total);
    else expense = toNumber(row.total);
  }

  const incomeByCategory = await db
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
    .groupBy(categories.name);

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

export async function listTransactions(
  userId: string,
  yearMonth?: string,
  opts?: {
    type?: "income" | "expense" | "all";
    categoryId?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const conditions = [eq(transactions.userId, userId)];
  if (yearMonth) {
    const { start, end } = monthDateBounds(yearMonth);
    conditions.push(gte(transactions.date, start));
    conditions.push(lte(transactions.date, end));
  }
  if (opts?.type === "income" || opts?.type === "expense") {
    conditions.push(eq(transactions.type, opts.type));
  }
  if (opts?.categoryId) {
    conditions.push(eq(transactions.categoryId, opts.categoryId));
  }

  const where = and(...conditions);
  const paginate = opts?.page != null || opts?.pageSize != null;
  const pageSize = paginate
    ? Math.min(100, Math.max(1, opts?.pageSize ?? 20))
    : undefined;
  const page = paginate ? Math.max(1, opts?.page ?? 1) : 1;
  const offset = paginate && pageSize ? (page - 1) * pageSize : 0;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(where);

  const total = Number(countRow?.count ?? 0);

  const query = db
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
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(where)
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt));

  const rows =
    pageSize != null
      ? await query.limit(pageSize).offset(offset)
      : await query;

  return {
    rows,
    total,
    page,
    pageSize: pageSize ?? total,
    totalPages: pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1,
  };
}

export async function listCategories(userId: string, kind?: "expense" | "income") {
  const conditions = [eq(categories.userId, userId)];
  if (kind) conditions.push(eq(categories.kind, kind));

  return db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(asc(categories.sortOrder));
}

/** Shared insert used by server actions and offline sync API. */
export async function insertTransactionForUser(
  userId: string,
  input: {
    date: string;
    description: string;
    categoryId: string;
    type: "expense" | "income";
    amount: number;
    occurredAt?: string;
    clientId?: string;
  },
): Promise<{ id: string; duplicate: boolean }> {
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

  const occurredAt = input.occurredAt
    ? new Date(input.occurredAt)
    : new Date(`${input.date}T12:00:00`);
  const dateOnly =
    input.date ||
    (Number.isNaN(occurredAt.getTime())
      ? new Date().toISOString().slice(0, 10)
      : occurredAt.toISOString().slice(0, 10));

  try {
    const [row] = await db
      .insert(transactions)
      .values({
        userId,
        date: dateOnly,
        occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
        description: input.description,
        categoryId: input.categoryId,
        type: input.type,
        amount: input.amount.toFixed(2),
        clientId: input.clientId ?? null,
      })
      .returning();

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

export async function getDebtDashboard(userId: string) {
  const accounts = await db
    .select()
    .from(debtAccounts)
    .where(eq(debtAccounts.userId, userId))
    .orderBy(asc(debtAccounts.name));

  const payments = await db
    .select({
      id: debtPayments.id,
      accountId: debtPayments.accountId,
      accountName: debtAccounts.name,
      dueDate: debtPayments.dueDate,
      paymentType: debtPayments.paymentType,
      amount: debtPayments.amount,
      isPaid: debtPayments.isPaid,
    })
    .from(debtPayments)
    .innerJoin(debtAccounts, eq(debtPayments.accountId, debtAccounts.id))
    .where(eq(debtPayments.userId, userId))
    .orderBy(desc(debtPayments.dueDate));

  const [settings] = await db
    .select()
    .from(debtSettings)
    .where(eq(debtSettings.userId, userId))
    .limit(1);

  const paidByAccount = new Map<string, number>();
  for (const p of payments) {
    if (!p.isPaid) continue;
    paidByAccount.set(
      p.accountId,
      (paidByAccount.get(p.accountId) ?? 0) + toNumber(p.amount),
    );
  }

  const accountRows = accounts.map((a) => {
    const starting = toNumber(a.startingBalance);
    const paid = paidByAccount.get(a.id) ?? 0;
    return {
      ...a,
      startingBalanceNum: starting,
      totalPaid: paid,
      pending: Math.max(0, starting - paid),
    };
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
    const ym = yearMonthFromDate(p.dueDate);
    paymentsByMonth[ym] = (paymentsByMonth[ym] ?? 0) + toNumber(p.amount);
  }

  return {
    accounts: accountRows,
    payments,
    settings,
    totals,
    paymentsByMonth,
  };
}

function revalidateGoals() {
  revalidatePath("/goals");
  revalidatePath("/overview");
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

export async function createSavingsGoal(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const targetAmount = parseAmount(String(formData.get("targetAmount") ?? "0"));
  const currentAmount = parseAmount(
    String(formData.get("currentAmount") ?? "0"),
  );
  const targetDateRaw = String(formData.get("targetDate") ?? "").trim();
  const targetDate = targetDateRaw || null;

  if (!name) throw new Error("Name is required");
  if (targetAmount <= 0) throw new Error("Target amount must be greater than 0");

  await db.insert(savingsGoals).values({
    userId: user.id,
    name,
    targetAmount: targetAmount.toFixed(2),
    currentAmount: Math.max(0, currentAmount).toFixed(2),
    targetDate,
  });

  revalidateGoals();
}

export async function contributeToSavingsGoal(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "0"));

  if (!id) throw new Error("Missing goal");
  if (amount <= 0) throw new Error("Amount must be greater than 0");

  const existing = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, user.id)))
    .limit(1);

  if (!existing[0]) throw new Error("Goal not found");

  const next = toNumber(existing[0].currentAmount) + amount;
  await db
    .update(savingsGoals)
    .set({ currentAmount: next.toFixed(2) })
    .where(eq(savingsGoals.id, id));

  revalidateGoals();
}

export async function deleteSavingsGoal(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, user.id)));

  revalidateGoals();
}

export async function changePassword(formData: FormData) {
  const sessionUser = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new Error("All password fields are required");
  }
  if (newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters");
  }
  if (newPassword !== confirmPassword) {
    throw new Error("New passwords do not match");
  }
  if (newPassword === currentPassword) {
    throw new Error("New password must be different from the current one");
  }

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!row) {
    throw new Error("Account not found. Sign out and sign in again.");
  }

  const valid = await compare(currentPassword, row.passwordHash);
  if (!valid) {
    throw new Error("Current password is incorrect");
  }

  const passwordHash = await hash(newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, row.id));

  revalidatePath("/settings");
}
