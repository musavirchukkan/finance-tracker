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
 * - If the payment due for lastBill is already past and there is no unpaid
 *   closed-cycle activity left, advance due/bill display to the next cycle
 *   (e.g. card added after due date, or no payment logged for that cycle).
 * - When activity history does not explain a balance, `currentOutstanding`
 *   fills amount due (minus open-cycle pending when known).
 */
export function summarizeCardStatement(args: {
  billingDay: number | null | undefined;
  paymentDueDay: number | null | undefined;
  activities: StatementActivity[];
  from?: Date;
  /** Revolving balance on the card; used when activities under-explain due. */
  currentOutstanding?: number;
}): CardStatementSummary {
  const from = args.from ?? new Date();
  const todayKey = toDateKey(startOfDay(from));
  const nextBillDate = nextCycleDate(args.billingDay, from);
  const lastBillDate = previousCycleDate(args.billingDay, from);

  let prevBillDate: string | null = null;
  if (lastBillDate) {
    const [y, m, d] = lastBillDate.split("-").map(Number);
    const dayBefore = new Date(y, m - 1, d - 1, 12, 0, 0, 0);
    prevBillDate = previousCycleDate(args.billingDay, dayBefore);
  }

  let nextDueDate = lastBillDate
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

  let amountDue = Math.max(
    0,
    Math.round((closedCharges - paymentsAfterBill) * 100) / 100,
  );
  nextBillPending = Math.max(0, Math.round(nextBillPending * 100) / 100);

  const hasChargeActivities = args.activities.some(
    (a) => a.outstandingDelta > 0 && !isPaymentType(a.activityType),
  );
  const outstanding = Math.max(0, args.currentOutstanding ?? 0);

  // Past due with nothing still owed on that closed cycle → track next bill/due.
  const dueIsPast = !!nextDueDate && nextDueDate < todayKey;
  if (dueIsPast && amountDue <= 0) {
    nextDueDate = nextBillDate
      ? dueDateForBill(nextBillDate, args.paymentDueDay)
      : nextCycleDate(args.paymentDueDay, from);
  }

  // No (or incomplete) activity ledger: revolving outstanding is what to pay,
  // minus charges already attributed to the open/next statement.
  if (!hasChargeActivities && outstanding > 0) {
    amountDue = Math.max(
      0,
      Math.round((outstanding - nextBillPending) * 100) / 100,
    );
  } else if (hasChargeActivities && outstanding > 0) {
    // Prefer the larger of activity-closed due vs outstanding not yet on next bill.
    const fromOutstanding = Math.max(
      0,
      Math.round((outstanding - nextBillPending) * 100) / 100,
    );
    amountDue = Math.max(amountDue, fromOutstanding);
  }

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
      return "Card → wallet";
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

/** Display label with optional last-4 digits, e.g. "HDFC ···· 4321". */
export function formatCardLabel(
  name: string,
  lastFour?: string | null,
): string {
  const digits = String(lastFour ?? "").replace(/\D/g, "").slice(-4);
  if (digits.length === 4) return `${name} ···· ${digits}`;
  return name;
}

export function normalizeLastFour(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(-4);
  return digits.length === 4 ? digits : null;
}

/** Available credit after revolving + EMI principal blocked. */
export function availableCredit(args: {
  creditLimit: number | null | undefined;
  revolvingOutstanding: number;
  emiBlocked: number;
}): number | null {
  if (args.creditLimit == null || !Number.isFinite(args.creditLimit)) {
    return null;
  }
  const used =
    Math.max(0, args.revolvingOutstanding) + Math.max(0, args.emiBlocked);
  return Math.max(0, Math.round((args.creditLimit - used) * 100) / 100);
}

/** Statement spend due + linked monthly EMI installments. */
export function totalDueThisCycle(args: {
  statementDue: number;
  linkedMonthlyEmi: number;
}): number {
  return Math.max(
    0,
    Math.round(
      (Math.max(0, args.statementDue) + Math.max(0, args.linkedMonthlyEmi)) *
        100,
    ) / 100,
  );
}
