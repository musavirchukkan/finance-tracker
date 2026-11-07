"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WRITE_RATE_LIMIT } from "@/lib/constants";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import {
  formString,
  parseOrThrow,
  zIncomeExpense,
  zNonEmpty,
  zUuid,
} from "@/lib/form-schemas";
import { assertWriteRateLimit } from "@/lib/rate-limit";
import { invalidateCategoryCache } from "@/lib/ref-cache";
import { requireUser } from "@/lib/session";

const categorySchema = z.object({
  name: zNonEmpty,
  kind: zIncomeExpense,
  icon: z.string(),
});

export async function createCategory(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const raw = parseOrThrow(
    categorySchema,
    {
      name: formString(formData, "name"),
      kind: formString(formData, "kind") || "expense",
      icon: formString(formData, "icon"),
    },
    "Name required",
  );
  const icon = raw.icon.trim() || null;

  const max = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(eq(categories.userId, user.id))
    .orderBy(desc(categories.sortOrder))
    .limit(1);

  await db.insert(categories).values({
    userId: user.id,
    name: raw.name,
    kind: raw.kind,
    icon,
    sortOrder: (max[0]?.sortOrder ?? -1) + 1,
  });

  await invalidateCategoryCache(user.id);
  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
}

export async function updateCategory(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const raw = parseOrThrow(
    categorySchema.extend({ id: zUuid }),
    {
      id: formString(formData, "id").trim(),
      name: formString(formData, "name"),
      kind: formString(formData, "kind") || "expense",
      icon: formString(formData, "icon"),
    },
    "Missing fields",
  );
  const icon = raw.icon.trim() || null;

  await db
    .update(categories)
    .set({ name: raw.name, kind: raw.kind, icon, updatedAt: new Date() })
    .where(and(eq(categories.id, raw.id), eq(categories.userId, user.id)));

  await invalidateCategoryCache(user.id);
  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
}

export async function deleteCategory(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing category",
  ).id;

  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));

  await invalidateCategoryCache(user.id);
  revalidatePath("/settings");
  revalidatePath("/budget");
  revalidatePath("/overview");
  revalidatePath("/analytics");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
}
