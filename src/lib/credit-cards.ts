export const CARD_ACTIVITY_TYPES = [
  "spend",
  "wallet_recharge",
  "wallet_cashout",
  "fee",
  "bill_payment",
] as const;

export type CardActivityType = (typeof CARD_ACTIVITY_TYPES)[number];

/** Preferred day of month 1–31 (resolved per-month to last day when needed). */
export function clampBillingDay(day: number | null | undefined): number | null {
  if (day == null || !Number.isFinite(day)) return null;
  const n = Math.floor(day);
  if (n < 1 || n > 31) return null;
  return n;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Calendar date for preferred day in a month (clamps 29–31 in short months). */
export function dateForDayInMonth(
  year: number,
  monthIndex: number,
  preferredDay: number,
): Date {
  const dim = daysInMonth(year, monthIndex);
  const day = Math.min(Math.max(1, preferredDay), dim);
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

function toDateKey(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Next occurrence of preferred day on or after `from` (month-length aware). */
export function nextCycleDate(
  dayOfMonth: number | null | undefined,
  from = new Date(),
): string | null {
  const day = clampBillingDay(dayOfMonth);
  if (!day) return null;
  const start = startOfDay(from);
  let y = start.getFullYear();
  let m = start.getMonth();
  for (let i = 0; i < 14; i++) {
    const candidate = dateForDayInMonth(y, m, day);
    if (candidate >= start) return toDateKey(candidate);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return null;
}

/** Most recent occurrence of preferred day on or before `from`. */
export function previousCycleDate(
  dayOfMonth: number | null | undefined,
  from = new Date(),
): string | null {
  const day = clampBillingDay(dayOfMonth);
  if (!day) return null;
  const start = startOfDay(from);
  let y = start.getFullYear();
  let m = start.getMonth();
  for (let i = 0; i < 14; i++) {
    const candidate = dateForDayInMonth(y, m, day);
    if (candidate <= start) return toDateKey(candidate);
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return null;
}

/**
 * Payment due date for a closed bill.
 * If due day is after bill day in that month → same month; otherwise next month.
 */
export function dueDateForBill(
  billDateKey: string,
  dueDay: number | null | undefined,
): string | null {
  const day = clampBillingDay(dueDay);
  if (!day) return null;
  const [ys, ms, ds] = billDateKey.split("-").map(Number);
  const billDate = new Date(ys, ms - 1, ds, 12, 0, 0, 0);
  const y = billDate.getFullYear();
  const m = billDate.getMonth();
  let due = dateForDayInMonth(y, m, day);
  if (due <= billDate) {
    due = dateForDayInMonth(y, m + 1, day);
  }
  return toDateKey(due);
}

export type StatementActivity = {
  date: string;
  activityType: string;
  outstandingDelta: number;
};

export type CardStatementSummary = {
  lastBillDate: string | null;
  nextBillDate: string | null;
  /** Due date for the closed (last) statement. */
  nextDueDate: string | null;
  /** Amount still owed for the closed statement (due this cycle). */
  amountDue: number;
  /** Charges after last bill → next statement. */
  nextBillPending: number;
  prevBillDate: string | null;
};

function isPaymentType(type: string) {
  return type === "bill_payment";
}

/**
 * Statement math:
 * - Closed cycle (prevBill, lastBill]: charges appear on the bill that closed lastBill.
 * - Payments on/after lastBill reduce amount due.
 * - Open cycle (lastBill, ∞ / nextBill]: charges go to next bill.
 */
export function summarizeCardStatement(args: {
  billingDay: number | null | undefined;
  paymentDueDay: number | null | undefined;
  activities: StatementActivity[];
  from?: Date;
}): CardStatementSummary {
  const from = args.from ?? new Date();
  const nextBillDate = nextCycleDate(args.billingDay, from);
  const lastBillDate = previousCycleDate(args.billingDay, from);

  let prevBillDate: string | null = null;
  if (lastBillDate) {
    const [y, m, d] = lastBillDate.split("-").map(Number);
    const dayBefore = new Date(y, m - 1, d - 1, 12, 0, 0, 0);
    prevBillDate = previousCycleDate(args.billingDay, dayBefore);
  }

  const nextDueDate = lastBillDate
    ? dueDateForBill(lastBillDate, args.paymentDueDay)
    : nextCycleDate(args.paymentDueDay, from);

  let closedCharges = 0;
  let paymentsAfterBill = 0;
  let nextBillPending = 0;

  for (const a of args.activities) {
    const delta = a.outstandingDelta;
    if (!lastBillDate) {
      if (delta > 0) nextBillPending += delta;
      continue;
    }

    if (isPaymentType(a.activityType) || delta < 0) {
      if (a.date >= lastBillDate) {
        paymentsAfterBill += Math.abs(delta);
      }
      continue;
    }

    if (delta <= 0) continue;

    // Charge: after last bill → next statement; else in closed cycle after prev bill
    if (a.date > lastBillDate) {
      nextBillPending += delta;
    } else if (!prevBillDate || a.date > prevBillDate) {
      closedCharges += delta;
    }
  }

  const amountDue = Math.max(
    0,
    Math.round((closedCharges - paymentsAfterBill) * 100) / 100,
  );
  nextBillPending = Math.max(0, Math.round(nextBillPending * 100) / 100);

  return {
    lastBillDate,
    nextBillDate,
    nextDueDate,
    amountDue,
    nextBillPending,
    prevBillDate,
  };
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

/** Which statement a charge date belongs to (bill date on or after the charge). */
export function statementBillDateForCharge(
  chargeDate: string,
  billingDay: number | null | undefined,
): string | null {
  const day = clampBillingDay(billingDay);
  if (!day) return null;
  const [y, m, d] = chargeDate.split("-").map(Number);
  const charge = new Date(y, m - 1, d, 0, 0, 0, 0);
  return nextCycleDate(day, charge);
}
