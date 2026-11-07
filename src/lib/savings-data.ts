import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savingsGoals } from "@/lib/db/schema";
import { toNumber } from "@/lib/money";

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
