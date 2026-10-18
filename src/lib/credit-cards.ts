export const CARD_ACTIVITY_TYPES = [
  "spend",
  "wallet_recharge",
  "wallet_cashout",
  "fee",
  "bill_payment",
  "emi_posted",
] as const;

export type CardActivityType = (typeof CARD_ACTIVITY_TYPES)[number];

export const CARD_STATUS_OPTIONS = ["Active", "Inactive"] as const;
export type CardStatus = (typeof CARD_STATUS_OPTIONS)[number];

export function normalizeCardStatus(
  raw: string | null | undefined,
): CardStatus {
  return String(raw ?? "")
    .trim()
    .toLowerCase() === "inactive"
    ? "Inactive"
    : "Active";
}

export function isActiveCardStatus(status: string | null | undefined): boolean {
  return normalizeCardStatus(status) === "Active";
}

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
 * Payment due date for a closed bill from a day-of-month due day.
 * @deprecated Prefer dueDateFromBill with paymentDueGapDays.
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

/** Clamp due-gap to a sensible range (1–60 calendar days). */
export function clampDueGapDays(
  days: number | null | undefined,
): number | null {
  if (days == null || !Number.isFinite(days)) return null;
  const n = Math.floor(days);
  if (n < 1 || n > 60) return null;
  return n;
}

/**
 * Payment due = statement date + gap calendar days (month-length aware).
 * Example: bill 2026-09-20 + 20 days → 2026-10-10.
 */
export function dueDateFromBill(
  billDateKey: string,
  gapDays: number | null | undefined,
): string | null {
  const gap = clampDueGapDays(gapDays);
  if (gap == null) return null;
  const [ys, ms, ds] = billDateKey.split("-").map(Number);
  if (!ys || !ms || !ds) return null;
  const due = new Date(ys, ms - 1, ds, 12, 0, 0, 0);
  due.setDate(due.getDate() + gap);
  return toDateKey(due);
}

/**
 * Estimate gap days from legacy billing day + due day-of-month fields.
 * Used when migrating old card rows.
 */
export function estimateDueGapDays(
  billingDay: number | null | undefined,
  dueDay: number | null | undefined,
): number {
  const bill = clampBillingDay(billingDay);
  const due = clampBillingDay(dueDay);
  if (!bill || !due) return 20;
  const billKey = toDateKey(dateForDayInMonth(2024, 0, bill));
  const dueKey = dueDateForBill(billKey, due);
  if (!dueKey) return 20;
  const [by, bm, bd] = billKey.split("-").map(Number);
  const [dy, dm, dd] = dueKey.split("-").map(Number);
  const a = new Date(by, bm - 1, bd, 12, 0, 0, 0);
  const b = new Date(dy, dm - 1, dd, 12, 0, 0, 0);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000));
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
 *   closed-cycle balance left, advance due/bill display to the next cycle.
 * - `statementAmount` (bank bill) pins due-to-pay; leftover outstanding → next bill.
 * - `pinToCurrentStatement` keeps outstanding on the current bill (add-card mid-cycle).
 */
export function summarizeCardStatement(args: {
  billingDay: number | null | undefined;
  /** Calendar days after bill date until payment is due. */
  paymentDueGapDays: number | null | undefined;
  activities: StatementActivity[];
  from?: Date;
  /** Revolving balance on the card; used when activities under-explain due. */
  currentOutstanding?: number;
  /** Explicit closed-statement amount from the bank (optional). */
  statementAmount?: number | null;
  /** Force outstanding onto current statement due (don't advance cycle early). */
  pinToCurrentStatement?: boolean;
}): CardStatementSummary {
  const from = args.from ?? new Date();
  const todayKey = toDateKey(startOfDay(from));
  const nextBillDate = nextCycleDate(args.billingDay, from);
  const lastBillDate = previousCycleDate(args.billingDay, from);
  const gap = clampDueGapDays(args.paymentDueGapDays);
  const pin = !!args.pinToCurrentStatement;
  const statementRaw =
    args.statementAmount != null && Number.isFinite(args.statementAmount)
      ? Math.max(0, args.statementAmount)
      : null;

  let prevBillDate: string | null = null;
  if (lastBillDate) {
    const [y, m, d] = lastBillDate.split("-").map(Number);
    const dayBefore = new Date(y, m - 1, d - 1, 12, 0, 0, 0);
    prevBillDate = previousCycleDate(args.billingDay, dayBefore);
  }

  let nextDueDate = lastBillDate
    ? dueDateFromBill(lastBillDate, gap)
    : nextBillDate
      ? dueDateFromBill(nextBillDate, gap)
      : null;

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

  // Outstanding only counts as “due this cycle” when the user included the
  // bank bill (statement amount and/or pin). Otherwise leave revolving as
  // open until the next statement — do not invent an overdue previous bill.
  const billIncluded =
    pin || (statementRaw != null && statementRaw > 0);

  if (statementRaw != null) {
    amountDue = Math.max(
      0,
      Math.round((statementRaw - paymentsAfterBill) * 100) / 100,
    );
    const leftover = Math.max(
      0,
      Math.round((outstanding - amountDue) * 100) / 100,
    );
    if (!hasChargeActivities) {
      nextBillPending = leftover;
    } else {
      nextBillPending = Math.max(nextBillPending, leftover);
    }
  } else if (pin && outstanding > 0) {
    // Whole outstanding counts on the current closed bill.
    amountDue = Math.max(
      0,
      Math.round((outstanding - nextBillPending) * 100) / 100,
    );
  } else if (billIncluded && !hasChargeActivities && outstanding > 0) {
    amountDue = Math.max(
      0,
      Math.round((outstanding - nextBillPending) * 100) / 100,
    );
  } else if (billIncluded && hasChargeActivities && outstanding > 0) {
    const fromOutstanding = Math.max(
      0,
      Math.round((outstanding - nextBillPending) * 100) / 100,
    );
    amountDue = Math.max(amountDue, fromOutstanding);
  } else if (!billIncluded && outstanding > 0 && !hasChargeActivities) {
    // No included bill yet — outstanding waits on the next statement.
    nextBillPending = Math.max(nextBillPending, outstanding);
  }

  // Advance past a closed cycle when nothing is owed on it, or when the user
  // never included that bill (so a past due date must not look “overdue”).
  const dueIsPast = !!nextDueDate && nextDueDate < todayKey;
  const stillOwesCurrent =
    amountDue > 0 ||
    (billIncluded &&
      (pin || (statementRaw != null && statementRaw > paymentsAfterBill)));
  if (dueIsPast && !stillOwesCurrent) {
    nextDueDate = nextBillDate ? dueDateFromBill(nextBillDate, gap) : null;
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
    case "emi_posted":
      return "EMI posted";
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

/** Available credit after revolving + EMI principal blocked.
 *  Can be negative when used exceeds the limit (ledger never blocks spends). */
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
  return Math.round((args.creditLimit - used) * 100) / 100;
}

type LimitLinkCard = {
  id: string;
  sharesLimitWithId?: string | null;
  creditLimit?: string | number | null;
  currentOutstanding?: string | number | null;
};

/** Walk sharesLimitWithId to the card that owns the shared limit. */
export function resolveLimitRootId(
  cardId: string,
  cards: LimitLinkCard[],
): string {
  const byId = new Map(cards.map((c) => [c.id, c]));
  let cur = cardId;
  const seen = new Set<string>();
  while (!seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    const parent = row?.sharesLimitWithId ?? null;
    if (!parent || !byId.has(parent)) return cur;
    cur = parent;
  }
  return cur;
}

/** Cards that draw from the same shared limit as `cardId`. */
export function sharedLimitMemberIds(
  cardId: string,
  cards: LimitLinkCard[],
): string[] {
  const rootId = resolveLimitRootId(cardId, cards);
  return cards
    .filter((c) => resolveLimitRootId(c.id, cards) === rootId)
    .map((c) => c.id);
}

/**
 * Available credit for a card, pooling revolving + EMI across every card
 * that shares the same limit root.
 */
export function availableCreditForSharedLimit(args: {
  cardId: string;
  cards: LimitLinkCard[];
  emiBlockedByCard: Map<string, number> | Record<string, number>;
}): number | null {
  const { cardId, cards } = args;
  const emiMap =
    args.emiBlockedByCard instanceof Map
      ? args.emiBlockedByCard
      : new Map(Object.entries(args.emiBlockedByCard));
  const byId = new Map(cards.map((c) => [c.id, c]));
  if (!byId.has(cardId)) return null;

  const rootId = resolveLimitRootId(cardId, cards);
  const root = byId.get(rootId);
  const limit =
    root?.creditLimit != null && root.creditLimit !== ""
      ? Number(root.creditLimit)
      : null;

  const members = sharedLimitMemberIds(cardId, cards);
  let revolving = 0;
  let emiBlocked = 0;
  for (const id of members) {
    const row = byId.get(id);
    revolving += Math.max(0, Number(row?.currentOutstanding ?? 0) || 0);
    emiBlocked += Math.max(0, emiMap.get(id) ?? 0);
  }

  return availableCredit({
    creditLimit: limit != null && Number.isFinite(limit) ? limit : null,
    revolvingOutstanding: revolving,
    emiBlocked,
  });
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
