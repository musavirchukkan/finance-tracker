"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WRITE_RATE_LIMIT } from "@/lib/constants";
import { db } from "@/lib/db";
import { savingsGoals } from "@/lib/db/schema";
import {
  formString,
  parseOrThrow,
  zDate,
  zNonEmpty,
  zUuid,
} from "@/lib/form-schemas";
import { parseAmount, toNumber } from "@/lib/money";
import { assertWriteRateLimit } from "@/lib/rate-limit";
import { UserFacingError } from "@/lib/safe-error";
import { requireUser } from "@/lib/session";

function revalidateGoals() {
  revalidatePath("/goals");
  revalidatePath("/overview");
}

const savingsGoalSchema = z.object({
  name: zNonEmpty,
  targetAmount: z.string(),
  currentAmount: z.string(),
  targetDate: z.string(),
});

export async function createSavingsGoal(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const raw = parseOrThrow(
    savingsGoalSchema,
    {
      name: formString(formData, "name"),
      targetAmount: formString(formData, "targetAmount") || "0",
      currentAmount: formString(formData, "currentAmount") || "0",
      targetDate: formString(formData, "targetDate"),
    },
    "Name is required",
  );
  const targetAmount = parseAmount(raw.targetAmount);
  const currentAmount = parseAmount(raw.currentAmount);
  const targetDate = raw.targetDate.trim() || null;
  if (targetDate && !zDate.safeParse(targetDate).success) {
    throw new UserFacingError("Enter a valid target date");
  }
  if (targetAmount <= 0) {
    throw new UserFacingError("Target amount must be greater than 0");
  }

  await db.insert(savingsGoals).values({
    userId: user.id,
    name: raw.name,
    targetAmount: targetAmount.toFixed(2),
    currentAmount: Math.max(0, currentAmount).toFixed(2),
    targetDate,
  });

  revalidateGoals();
}

export async function contributeToSavingsGoal(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const raw = parseOrThrow(
    z.object({ id: zUuid, amount: z.string() }),
    {
      id: formString(formData, "id").trim(),
      amount: formString(formData, "amount") || "0",
    },
    "Missing goal",
  );
  const amount = parseAmount(raw.amount);
  if (amount <= 0) throw new UserFacingError("Amount must be greater than 0");

  const existing = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, raw.id), eq(savingsGoals.userId, user.id)))
    .limit(1);

  if (!existing[0]) throw new UserFacingError("Goal not found");

  const next = toNumber(existing[0].currentAmount) + amount;
  await db
    .update(savingsGoals)
    .set({ currentAmount: next.toFixed(2), updatedAt: new Date() })
    .where(eq(savingsGoals.id, raw.id));

  revalidateGoals();
}

export async function deleteSavingsGoal(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(user.id, "write", WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  const id = parseOrThrow(
    z.object({ id: zUuid }),
    { id: formString(formData, "id").trim() },
    "Missing goal",
  ).id;

  await db
    .delete(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, user.id)));

  revalidateGoals();
}
