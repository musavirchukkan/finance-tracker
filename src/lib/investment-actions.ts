"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { investments } from "@/lib/db/schema";
import { formString, zNonEmpty, zUuid } from "@/lib/form-schemas";
import { isInvestmentType } from "@/lib/investments";
import { parseAmount } from "@/lib/money";
import { UserFacingError } from "@/lib/safe-error";
import { requireUser } from "@/lib/session";

function revalidateWealth() {
  revalidatePath("/wealth");
  revalidatePath("/overview");
  revalidatePath("/more");
}

const holdingSchema = z.object({
  name: zNonEmpty,
  type: z.string().trim().default("stock"),
  symbol: z.string().trim().optional(),
  quantity: z.string().trim().default("1"),
  currentPrice: z.string().trim().default("0"),
  avgBuyPrice: z.string().trim().optional(),
  platform: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function parseHolding(formData: FormData) {
  const parsed = holdingSchema.safeParse({
    name: formString(formData, "name"),
    type: formString(formData, "type") || "stock",
    symbol: formString(formData, "symbol"),
    quantity: formString(formData, "quantity") || "1",
    currentPrice: formString(formData, "currentPrice") || "0",
    avgBuyPrice: formString(formData, "avgBuyPrice"),
    platform: formString(formData, "platform"),
    notes: formString(formData, "notes"),
  });
  if (!parsed.success) {
    throw new UserFacingError(
      parsed.error.issues[0]?.message ?? "Invalid holding",
    );
  }
  const typeRaw = parsed.data.type;
  const type = isInvestmentType(typeRaw) ? typeRaw : "other";
  const quantity = parseAmount(parsed.data.quantity);
  const currentPrice = parseAmount(parsed.data.currentPrice);
  const avgRaw = parsed.data.avgBuyPrice?.trim() ?? "";
  const avgBuyPrice = avgRaw ? parseAmount(avgRaw) : null;
  if (quantity <= 0) throw new UserFacingError("Quantity must be greater than 0");
  if (currentPrice < 0) {
    throw new UserFacingError("Current price cannot be negative");
  }
  return {
    name: parsed.data.name,
    type,
    symbol: parsed.data.symbol?.trim() || null,
    quantity,
    currentPrice,
    avgBuyPrice,
    platform: parsed.data.platform?.trim() || null,
    notes: parsed.data.notes?.trim() || null,
  };
}

export async function createInvestment(formData: FormData) {
  const user = await requireUser();
  const holding = parseHolding(formData);

  await db.insert(investments).values({
    userId: user.id,
    name: holding.name,
    type: holding.type,
    symbol: holding.symbol,
    quantity: holding.quantity.toFixed(6),
    currentPrice: holding.currentPrice.toFixed(4),
    avgBuyPrice:
      holding.avgBuyPrice != null ? holding.avgBuyPrice.toFixed(4) : null,
    platform: holding.platform,
    notes: holding.notes,
  });

  revalidateWealth();
}

export async function updateInvestment(formData: FormData) {
  const user = await requireUser();
  const idParsed = zUuid.safeParse(formString(formData, "id").trim());
  if (!idParsed.success) throw new UserFacingError("Missing holding");
  const holding = parseHolding(formData);

  await db
    .update(investments)
    .set({
      name: holding.name,
      type: holding.type,
      symbol: holding.symbol,
      quantity: holding.quantity.toFixed(6),
      currentPrice: holding.currentPrice.toFixed(4),
      avgBuyPrice:
        holding.avgBuyPrice != null ? holding.avgBuyPrice.toFixed(4) : null,
      platform: holding.platform,
      notes: holding.notes,
      updatedAt: new Date(),
    })
    .where(
      and(eq(investments.id, idParsed.data), eq(investments.userId, user.id)),
    );

  revalidateWealth();
}

export async function deleteInvestment(formData: FormData) {
  const user = await requireUser();
  const idParsed = zUuid.safeParse(formString(formData, "id").trim());
  if (!idParsed.success) throw new UserFacingError("Missing holding");

  await db
    .delete(investments)
    .where(
      and(eq(investments.id, idParsed.data), eq(investments.userId, user.id)),
    );

  revalidateWealth();
}
