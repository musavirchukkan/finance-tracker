import { asc, eq } from "drizzle-orm";
import { listBankAccounts } from "@/lib/bank-data";
import { listCreditCards } from "@/lib/card-data";
import { db } from "@/lib/db";
import { investments } from "@/lib/db/schema";
import {
  holdingCost,
  holdingGain,
  holdingValue,
} from "@/lib/investments";
import {
  getDebtDashboard,
} from "@/lib/debt-data";
import { toNumber } from "@/lib/money";

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

export type MappedHolding = ReturnType<typeof mapHolding>;

export async function listInvestments(userId: string) {
  const rows = await db
    .select()
    .from(investments)
    .where(eq(investments.userId, userId))
    .orderBy(asc(investments.name));
  return rows.map(mapHolding);
}

type NetWorthParts = {
  banks: Awaited<ReturnType<typeof listBankAccounts>>;
  cards: Awaited<ReturnType<typeof listCreditCards>>;
  debt: Awaited<ReturnType<typeof getDebtDashboard>>;
  holdings: MappedHolding[];
};

/** Pure aggregation — no DB (H3: reuse overview fetches). */
export function buildNetWorth(parts: NetWorthParts) {
  const { banks, cards, debt, holdings } = parts;
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

export async function getNetWorth(
  userId: string,
  preloaded?: Partial<NetWorthParts>,
) {
  const [banks, cards, debt, holdings] = await Promise.all([
    preloaded?.banks
      ? Promise.resolve(preloaded.banks)
      : listBankAccounts(userId),
    preloaded?.cards
      ? Promise.resolve(preloaded.cards)
      : listCreditCards(userId),
    preloaded?.debt
      ? Promise.resolve(preloaded.debt)
      : getDebtDashboard(userId),
    preloaded?.holdings
      ? Promise.resolve(preloaded.holdings)
      : listInvestments(userId),
  ]);

  return buildNetWorth({ banks, cards, debt, holdings });
}
