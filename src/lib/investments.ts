export const INVESTMENT_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "fd", label: "Fixed deposit" },
  { value: "gold", label: "Gold" },
  { value: "other", label: "Other" },
] as const;

export type InvestmentType = (typeof INVESTMENT_TYPES)[number]["value"];

export function isInvestmentType(value: string): value is InvestmentType {
  return INVESTMENT_TYPES.some((t) => t.value === value);
}

export function investmentTypeLabel(type: string): string {
  return INVESTMENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** Market / current value from quantity × price. */
export function holdingValue(quantity: number, currentPrice: number): number {
  return Math.round(quantity * currentPrice * 100) / 100;
}

/** Cost basis when avg buy price is set. */
export function holdingCost(
  quantity: number,
  avgBuyPrice: number | null | undefined,
): number | null {
  if (avgBuyPrice == null || !(avgBuyPrice >= 0)) return null;
  return Math.round(quantity * avgBuyPrice * 100) / 100;
}

export function holdingGain(
  value: number,
  cost: number | null,
): { amount: number; pct: number } | null {
  if (cost == null || cost <= 0) return null;
  const amount = Math.round((value - cost) * 100) / 100;
  const pct = Math.round(((value - cost) / cost) * 1000) / 10;
  return { amount, pct };
}
