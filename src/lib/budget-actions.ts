"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WRITE_RATE_LIMIT } from "@/lib/constants";
import { db } from "@/lib/db";
import { budgets, categories } from "@/lib/db/schema";
import { isBudgetableCategoryName } from "@/lib/budget-categories";
import {
  formString,
  parseOrThrow,
  zUuid,
  zYearMonth,
} from "@/lib/form-schemas";
import { parseAmount } from "@/lib/money";
import { assertWriteRateLimit } from "@/lib/rate-limit";
import { UserFacingError } from "@/lib/safe-error";
import { requireUser } from "@/lib/session";

const budgetSchema = z.object({
  categoryId: zUuid,
  yearMonth: zYearMonth,
  amount: z.string(),
});

export async function upsertBudgetAmount(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const raw = parseOrThrow(
    budgetSchema,
    {
      categoryId: formString(formData, "categoryId").trim(),
      yearMonth: formString(formData, "yearMonth").trim(),
      amount: formString(formData, "amount") || "0",
    },
    "Missing budget fields",
  );
  const amount = parseAmount(raw.amount);

  const [cat] = await db
    .select()
    .from(categories)
    .where(
      and(eq(categories.id, raw.categoryId), eq(categories.userId, user.id)),
    )
    .limit(1);
  if (!cat || cat.kind !== "expense" || !isBudgetableCategoryName(cat.name)) {
    throw new UserFacingError("This category cannot have a budget");
  }

  const existing = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, user.id),
        eq(budgets.categoryId, raw.categoryId),
        eq(budgets.yearMonth, raw.yearMonth),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(budgets)
      .set({ amount: amount.toFixed(2), updatedAt: new Date() })
      .where(eq(budgets.id, existing[0].id));
  } else {
    await db.insert(budgets).values({
      userId: user.id,
      categoryId: raw.categoryId,
      yearMonth: raw.yearMonth,
      amount: amount.toFixed(2),
    });
  }

  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
}
