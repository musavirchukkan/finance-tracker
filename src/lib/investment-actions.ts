"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDebtDashboard } from "@/lib/actions";
import { listBankAccounts } from "@/lib/bank-actions";
import { listCreditCards } from "@/lib/card-actions";
import { db } from "@/lib/db";
import { investments } from "@/lib/db/schema";
import {
  holdingCost,
  holdingGain,
  holdingValue,
  isInvestmentType,
} from "@/lib/investments";
import { parseAmount, toNumber } from "@/lib/money";
import { requireUser } from "@/lib/session";

function revalidateWealth() {
  revalidatePath("/wealth");
  revalidatePath("/overview");
  revalidatePath("/more");
}

function mapHolding(row: typeof investments.$inferSelect) {
  const quantity = toNumber(row.quantity);
  const currentPrice = toNumber(row.currentPrice);
  const avgBuyPrice =
    row.avgBuyPrice != null && row.avgBuyPrice !== ""
      ? toNumber(row.avgBuyPrice)
      : null;
  const value = holdingValue(quantity, currentPrice);
  const cost = holdingCost(quantity, avgBuyPrice);
  const gain = holdingGain(value, cost);
  return {
    ...row,
    quantityNum: quantity,
    currentPriceNum: currentPrice,
    avgBuyPriceNum: avgBuyPrice,
    valueNum: value,
    costNum: cost,
    gainAmount: gain?.amount ?? null,
    gainPct: gain?.pct ?? null,
  };
}

export async function listInvestments(userId: string) {
  const rows = await db
    .select()
    .from(investments)
    .where(eq(investments.userId, userId))
    .orderBy(asc(investments.name));
  return rows.map(mapHolding);
}

export async function getNetWorth(userId: string) {
  const [banks, cards, debt, holdings] = await Promise.all([
    listBankAccounts(userId),
    listCreditCards(userId),
    getDebtDashboard(userId),
    listInvestments(userId),
  ]);

  const bankCash = banks.reduce((s, a) => s + a.balanceNum, 0);
  const investmentsTotal = holdings.reduce((s, h) => s + h.valueNum, 0);
  const investmentsCost = holdings.reduce(
    (s, h) => s + (h.costNum ?? 0),
    0,
  );
  const cardOutstanding = cards.reduce((s, c) => s + c.outstandingNum, 0);
  const debtPending = debt.totals.pending;

  const assets = {
    bankCash,
    investments: investmentsTotal,
    total: Math.round((bankCash + investmentsTotal) * 100) / 100,
  };
  const liabilities = {
    debt: debtPending,
    cards: cardOutstanding,
    total: Math.round((debtPending + cardOutstanding) * 100) / 100,
  };
  const netWorth = Math.round((assets.total - liabilities.total) * 100) / 100;

  const byType = new Map<string, number>();
  for (const h of holdings) {
    byType.set(h.type, (byType.get(h.type) ?? 0) + h.valueNum);
  }

  return {
    assets,
    liabilities,
    netWorth,
    holdings,
    holdingsCost: Math.round(investmentsCost * 100) / 100,
    investmentByType: [...byType.entries()]
      .map(([type, value]) => ({ type, value }))
      .sort((a, b) => b.value - a.value),
    bankCount: banks.length,
    cardCount: cards.length,
    debtAccountCount: debt.accounts.length,
  };
}

export async function createInvestment(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "stock").trim();
  const type = isInvestmentType(typeRaw) ? typeRaw : "other";
  const symbol = String(formData.get("symbol") ?? "").trim() || null;
  const quantity = parseAmount(String(formData.get("quantity") ?? "1"));
  const currentPrice = parseAmount(String(formData.get("currentPrice") ?? "0"));
  const avgRaw = String(formData.get("avgBuyPrice") ?? "").trim();
  const avgBuyPrice = avgRaw ? parseAmount(avgRaw) : null;
  const platform = String(formData.get("platform") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) throw new Error("Name is required");
  if (quantity <= 0) throw new Error("Quantity must be greater than 0");
  if (currentPrice < 0) throw new Error("Current price cannot be negative");

  await db.insert(investments).values({
    userId: user.id,
    name,
    type,
    symbol,
    quantity: quantity.toFixed(6),
    currentPrice: currentPrice.toFixed(4),
    avgBuyPrice: avgBuyPrice != null ? avgBuyPrice.toFixed(4) : null,
    platform,
    notes,
  });

  revalidateWealth();
}

export async function updateInvestment(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "stock").trim();
  const type = isInvestmentType(typeRaw) ? typeRaw : "other";
  const symbol = String(formData.get("symbol") ?? "").trim() || null;
  const quantity = parseAmount(String(formData.get("quantity") ?? "1"));
  const currentPrice = parseAmount(String(formData.get("currentPrice") ?? "0"));
  const avgRaw = String(formData.get("avgBuyPrice") ?? "").trim();
  const avgBuyPrice = avgRaw ? parseAmount(avgRaw) : null;
  const platform = String(formData.get("platform") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!id) throw new Error("Missing holding");
  if (!name) throw new Error("Name is required");
  if (quantity <= 0) throw new Error("Quantity must be greater than 0");
  if (currentPrice < 0) throw new Error("Current price cannot be negative");

  await db
    .update(investments)
    .set({
      name,
      type,
      symbol,
      quantity: quantity.toFixed(6),
      currentPrice: currentPrice.toFixed(4),
      avgBuyPrice: avgBuyPrice != null ? avgBuyPrice.toFixed(4) : null,
      platform,
      notes,
      updatedAt: new Date(),
    })
    .where(and(eq(investments.id, id), eq(investments.userId, user.id)));

  revalidateWealth();
}

export async function deleteInvestment(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing holding");

  await db
    .delete(investments)
    .where(and(eq(investments.id, id), eq(investments.userId, user.id)));

  revalidateWealth();
}
