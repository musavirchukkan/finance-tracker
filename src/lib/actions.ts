"use server";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  budgets,
  categories,
  debtAccounts,
  debtPayments,
  debtSettings,
  transactions,
} from "@/lib/db/schema";
import { parseAmount, toNumber } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { yearMonthFromDate } from "@/lib/months";

export async function createTransaction(formData: FormData) {
  const user = await requireUser();
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "0"));

  if (!date || !description || !categoryId) {
    throw new Error("Missing required fields");
  }

  await db.insert(transactions).values({
    userId: user.id,
    date,
    description,
    categoryId,
    amount: amount.toFixed(2),
  });

  revalidatePath("/transactions");
  revalidatePath("/budget");
}

export async function updateTransaction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "0"));

  await db
    .update(transactions)
    .set({
      date,
      description,
      categoryId,
      amount: amount.toFixed(2),
    })
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));

  revalidatePath("/transactions");
  revalidatePath("/budget");
}

export async function deleteTransaction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));

  revalidatePath("/transactions");
  revalidatePath("/budget");
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
}

export async function deleteDebtAccount(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(debtAccounts)
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, user.id)));

  revalidatePath("/debt");
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
}

export async function deleteDebtPayment(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(debtPayments)
    .where(and(eq(debtPayments.id, id), eq(debtPayments.userId, user.id)));

  revalidatePath("/debt");
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
  revalidatePath("/settings");
}

export async function createCategory(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
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
    sortOrder: (max[0]?.sortOrder ?? -1) + 1,
  });

  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/transactions");
}

export async function deleteCategory(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));

  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/transactions");
}

export async function getBudgetSummary(userId: string, yearMonth: string) {
  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.sortOrder));

  const budgetRows = await db
    .select()
    .from(budgets)
    .where(
      and(eq(budgets.userId, userId), eq(budgets.yearMonth, yearMonth)),
    );

  const monthStart = `${yearMonth}-01`;
  // last day approx via next month - use date range with SQL
  const actualRows = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, monthStart),
        lte(transactions.date, `${yearMonth}-31`),
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

  return { rows, totals };
}

export async function listTransactions(
  userId: string,
  yearMonth?: string,
) {
  const conditions = [eq(transactions.userId, userId)];
  if (yearMonth) {
    conditions.push(gte(transactions.date, `${yearMonth}-01`));
    conditions.push(lte(transactions.date, `${yearMonth}-31`));
  }

  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt));
}

export async function listCategories(userId: string) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.sortOrder));
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
