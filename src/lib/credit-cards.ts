export const CARD_ACTIVITY_TYPES = [
  "spend",
  "wallet_recharge",
  "wallet_cashout",
  "fee",
  "bill_payment",
] as const;

export type CardActivityType = (typeof CARD_ACTIVITY_TYPES)[number];

export function clampBillingDay(day: number | null | undefined): number | null {
  if (day == null || !Number.isFinite(day)) return null;
  const n = Math.floor(day);
  if (n < 1 || n > 28) return null;
  return n;
}

/** Next calendar date for a billing/due day on or after `from`. */
export function nextCycleDate(
  dayOfMonth: number | null | undefined,
  from = new Date(),
): string | null {
  const day = clampBillingDay(dayOfMonth);
  if (!day) return null;
  const y = from.getFullYear();
  const m = from.getMonth();
  const candidate = new Date(y, m, day);
  candidate.setHours(12, 0, 0, 0);
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  if (candidate < start) {
    candidate.setMonth(candidate.getMonth() + 1);
  }
  const yy = candidate.getFullYear();
  const mm = String(candidate.getMonth() + 1).padStart(2, "0");
  const dd = String(candidate.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function activityLabel(type: string): string {
  switch (type) {
    case "spend":
      return "Spend";
    case "wallet_recharge":
      return "Wallet recharge";
    case "wallet_cashout":
      return "Wallet → bank";
    case "fee":
      return "Fee / charge";
    case "bill_payment":
      return "Bill payment";
    default:
      return type;
  }
}
