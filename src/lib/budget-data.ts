import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { cache } from "react";
import { cacheGetOrSetJson } from "@/lib/cache";
import { db } from "@/lib/db";
import {
  budgets,
  categories,
  type Category,
  transactions,
} from "@/lib/db/schema";
import { isBudgetableCategoryName } from "@/lib/budget-categories";
import { toNumber } from "@/lib/money";
import { monthDateBounds } from "@/lib/months";
import { REF_CACHE_TTL_SEC, RefCacheKeys } from "@/lib/ref-cache";

type CachedCategory = Omit<Category, "updatedAt"> & { updatedAt: string };

function reviveCategory(row: CachedCategory): Category {
  return {
    ...row,
    updatedAt: new Date(row.updatedAt),
  };
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

export const listCategories = cache(
  async (userId: string, kind?: "expense" | "income") => {
    const cached = await cacheGetOrSetJson<CachedCategory[]>(
      RefCacheKeys.categories(userId),
      REF_CACHE_TTL_SEC,
      async () => {
        const rows = await db
          .select()
          .from(categories)
          .where(eq(categories.userId, userId))
          .orderBy(asc(categories.sortOrder));
        return rows.map((row) => ({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
        }));
      },
    );

    const rows = cached.map(reviveCategory);
    if (!kind) return rows;
    return rows.filter((c) => c.kind === kind);
  },
);
