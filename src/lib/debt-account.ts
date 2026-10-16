export const PAID_TO_DATE_TYPE = "Paid to date";

/**
 * Auto-posted when a linked CC EMI hits the card statement date.
 * Unlocks principal from limit; full P+I+GST goes onto card outstanding.
 * No bank cashflow (pay the card bill separately).
 */
export const EMI_POSTED_TO_CARD_TYPE = "EMI posted to card";

/** India GST on credit-card / loan interest (user-editable per debt). */
export const DEFAULT_GST_ON_INTEREST_PERCENT = 18;

export function isEmiPostedToCardType(paymentType: string): boolean {
  return (
    paymentType.trim().toLowerCase() === EMI_POSTED_TO_CARD_TYPE.toLowerCase()
  );
}

export type InterestType = "fixed" | "reducing";

export function normalizeInterestType(
  raw: string | null | undefined,
): InterestType {
  return String(raw ?? "").trim().toLowerCase() === "reducing"
    ? "reducing"
    : "fixed";
}

export function computePaidTillNow(emi: number, monthsPaid: number): number {
  const e = Math.max(0, emi);
  const m = Math.max(0, Math.floor(monthsPaid));
  return Math.round(e * m * 100) / 100;
}

/** Principal-only installment: starting ÷ total months. */
export function computeMonthlyEmi(
  startingBalance: number,
  totalMonths: number,
): number {
  const months = Math.floor(totalMonths);
  if (startingBalance <= 0 || months <= 0) return 0;
  return Math.round((startingBalance / months) * 100) / 100;
}

/** Extra paid over principal across the full tenure. */
export function computeTotalInterest(args: {
  startingBalance: number;
  totalMonths: number;
  monthlyEmi: number;
}): number {
  const months = Math.floor(args.totalMonths);
  if (months <= 0) return 0;
  const totalPaid = Math.max(0, args.monthlyEmi) * months;
  return Math.max(0, Math.round((totalPaid - args.startingBalance) * 100) / 100);
}

export function computeMonthlyInterest(args: {
  startingBalance: number;
  totalMonths: number;
  monthlyEmi: number;
}): number {
  const principalEmi = computeMonthlyEmi(args.startingBalance, args.totalMonths);
  return Math.max(
    0,
    Math.round((Math.max(0, args.monthlyEmi) - principalEmi) * 100) / 100,
  );
}

/**
 * Flat annual interest rate implied by monthly EMI.
 * totalInterest = P * (rate/100) * (N/12)
 */
export function computeFlatAnnualInterestPercent(args: {
  startingBalance: number;
  totalMonths: number;
  monthlyEmi: number;
}): number {
  const months = Math.floor(args.totalMonths);
  const principal = args.startingBalance;
  if (principal <= 0 || months <= 0) return 0;
  const totalInterest = computeTotalInterest(args);
  if (totalInterest <= 0) return 0;
  const years = months / 12;
  return Math.round((totalInterest / principal / years) * 10000) / 100;
}

/** Monthly EMI from principal + flat annual interest %. */
export function computeMonthlyEmiFromInterestPercent(args: {
  startingBalance: number;
  totalMonths: number;
  interestPercent: number;
}): number {
  const months = Math.floor(args.totalMonths);
  const principal = Math.max(0, args.startingBalance);
  const rate = Math.max(0, args.interestPercent);
  if (principal <= 0 || months <= 0) return 0;
  const totalInterest =
    Math.round(principal * (rate / 100) * (months / 12) * 100) / 100;
  return Math.round(((principal + totalInterest) / months) * 100) / 100;
}

/** Monthly rate as a fraction for reducing-balance interest. */
export function monthlyReducingRate(annualPercent: number): number {
  return Math.max(0, annualPercent) / 100 / 12;
}

/**
 * Standard reducing-balance EMI (principal + interest only, before GST).
 * EMI = P * r * (1+r)^n / ((1+r)^n − 1)
 */
export function computeReducingMonthlyEmi(args: {
  startingBalance: number;
  totalMonths: number;
  interestPercent: number;
}): number {
  const months = Math.floor(args.totalMonths);
  const principal = Math.max(0, args.startingBalance);
  const r = monthlyReducingRate(args.interestPercent);
  if (principal <= 0 || months <= 0) return 0;
  if (r <= 0) return Math.round((principal / months) * 100) / 100;
  const factor = (1 + r) ** months;
  const emi = (principal * r * factor) / (factor - 1);
  return Math.round(emi * 100) / 100;
}

/** Suggested P+I EMI from interest type (GST is separate). */
export function computeSuggestedEmiPi(args: {
  startingBalance: number;
  totalMonths: number;
  interestPercent: number;
  interestType: InterestType | string;
}): number {
  const type = normalizeInterestType(args.interestType);
  if (type === "reducing") {
    return computeReducingMonthlyEmi(args);
  }
  return computeMonthlyEmiFromInterestPercent(args);
}

export function computeGstOnInterest(
  interestAmount: number,
  gstPercent: number = DEFAULT_GST_ON_INTEREST_PERCENT,
): number {
  const i = Math.max(0, interestAmount);
  const g = Math.max(0, gstPercent);
  return Math.round(i * (g / 100) * 100) / 100;
}

/**
 * Split one installment given remaining principal, rate type, and optional EMI (P+I).
 * GST is on interest only. All values are rounded to paise.
 */
export function suggestInstallmentSplit(args: {
  remainingPrincipal: number;
  interestPercent: number;
  interestType: InterestType | string;
  /** P+I installment (before GST). If omitted, uses remaining as interest base only. */
  emiPi?: number;
  gstPercent?: number;
  totalMonths?: number;
  startingBalance?: number;
}): {
  principal: number;
  interest: number;
  gst: number;
  total: number;
} {
  const remaining = Math.max(0, args.remainingPrincipal);
  const type = normalizeInterestType(args.interestType);
  const gstPct =
    args.gstPercent == null
      ? DEFAULT_GST_ON_INTEREST_PERCENT
      : Math.max(0, args.gstPercent);

  let interest = 0;
  if (type === "reducing") {
    interest = Math.round(remaining * monthlyReducingRate(args.interestPercent) * 100) / 100;
  } else {
    // Flat: average interest per month over tenure when known; else rate/12 on remaining.
    const months = Math.floor(args.totalMonths ?? 0);
    const start = Math.max(0, args.startingBalance ?? remaining);
    if (months > 0 && start > 0) {
      const totalInterest =
        Math.round(start * (Math.max(0, args.interestPercent) / 100) * (months / 12) * 100) /
        100;
      interest = Math.round((totalInterest / months) * 100) / 100;
    } else {
      interest =
        Math.round(remaining * monthlyReducingRate(args.interestPercent) * 100) / 100;
    }
  }

  const emiPi =
    args.emiPi != null && args.emiPi > 0
      ? args.emiPi
      : Math.round((remaining + interest) * 100) / 100;

  let principal = Math.round((emiPi - interest) * 100) / 100;
  if (principal < 0) principal = 0;
  if (principal > remaining) {
    principal = remaining;
    interest = Math.max(0, Math.round((emiPi - principal) * 100) / 100);
  }

  const gst = computeGstOnInterest(interest, gstPct);
  const total = Math.round((principal + interest + gst) * 100) / 100;
  return { principal, interest, gst, total };
}

export type ScheduleInstallment = {
  month: number;
  outstandingBefore: number;
  principal: number;
  interest: number;
  gst: number;
  total: number;
  outstandingAfter: number;
};

/**
 * Walk a reducing-balance schedule for `monthsPaid` completed installments.
 * Returns principal paid so far, remaining outstanding, and the next due split.
 */
export function rebuildFromSchedule(args: {
  startingBalance: number;
  monthlyEmi: number;
  interestPercent: number;
  interestType: InterestType | string;
  monthsPaid: number;
  totalMonths?: number;
  gstPercent?: number;
}): {
  principalPaid: number;
  remaining: number;
  next: ScheduleInstallment | null;
  completed: ScheduleInstallment[];
} {
  const start = Math.max(0, args.startingBalance);
  const emiPi = Math.max(0, args.monthlyEmi);
  const monthsPaid = Math.max(0, Math.floor(args.monthsPaid));
  const type = normalizeInterestType(args.interestType);
  const gstPct =
    args.gstPercent == null
      ? DEFAULT_GST_ON_INTEREST_PERCENT
      : Math.max(0, args.gstPercent);
  const totalMonths = Math.max(0, Math.floor(args.totalMonths ?? 0));

  if (type === "fixed") {
    const principalEmi = computeMonthlyEmi(start, totalMonths || monthsPaid);
    const principalPaid = computePaidTillNow(principalEmi, monthsPaid);
    const remaining = Math.max(0, Math.round((start - principalPaid) * 100) / 100);
    const interestMonthly = computeMonthlyInterest({
      startingBalance: start,
      totalMonths: totalMonths || monthsPaid,
      monthlyEmi: emiPi,
    });
    const gst = computeGstOnInterest(interestMonthly, gstPct);
    const principal = Math.max(
      0,
      Math.round((emiPi - interestMonthly) * 100) / 100,
    );
    return {
      principalPaid,
      remaining,
      next:
        remaining > 0 && emiPi > 0
          ? {
              month: monthsPaid + 1,
              outstandingBefore: remaining,
              principal,
              interest: interestMonthly,
              gst,
              total: Math.round((principal + interestMonthly + gst) * 100) / 100,
              outstandingAfter: Math.max(
                0,
                Math.round((remaining - principal) * 100) / 100,
              ),
            }
          : null,
      completed: [],
    };
  }

  // Reducing: amortize month by month.
  let outstanding = start;
  const completed: ScheduleInstallment[] = [];
  const maxSteps = Math.max(monthsPaid + 1, totalMonths || monthsPaid + 1, 1);

  for (let month = 1; month <= maxSteps && outstanding > 0; month++) {
    const split = suggestInstallmentSplit({
      remainingPrincipal: outstanding,
      interestPercent: args.interestPercent,
      interestType: "reducing",
      emiPi,
      gstPercent: gstPct,
    });
    const principal = Math.min(split.principal, outstanding);
    const after =
      Math.round((outstanding - principal) * 100) / 100;
    const row: ScheduleInstallment = {
      month,
      outstandingBefore: outstanding,
      principal,
      interest: split.interest,
      gst: split.gst,
      total: Math.round((principal + split.interest + split.gst) * 100) / 100,
      outstandingAfter: Math.max(0, after),
    };

    if (month <= monthsPaid) {
      completed.push(row);
      outstanding = row.outstandingAfter;
      continue;
    }

    // First unpaid month = next installment.
    const principalPaid =
      Math.round((start - outstanding) * 100) / 100;
    return {
      principalPaid: Math.max(0, principalPaid),
      remaining: outstanding,
      next: row,
      completed,
    };
  }

  const principalPaid = Math.round((start - outstanding) * 100) / 100;
  return {
    principalPaid: Math.max(0, principalPaid),
    remaining: Math.max(0, outstanding),
    next: null,
    completed,
  };
}

export function remainingMonths(totalMonths: number, monthsPaid: number): number {
  return Math.max(0, Math.floor(totalMonths) - Math.max(0, Math.floor(monthsPaid)));
}

export function remainingBalance(
  startingBalance: number,
  paidTillNow: number,
): number {
  return Math.max(0, startingBalance - paidTillNow);
}

export function validateDebtTenure(args: {
  startingBalance: number;
  monthlyEmi: number;
  totalMonths: number;
  monthsPaid: number;
  paidTillNow: number;
}): void {
  const {
    startingBalance,
    monthlyEmi,
    totalMonths,
    monthsPaid,
    paidTillNow,
  } = args;

  if (startingBalance < 0 || monthlyEmi < 0 || paidTillNow < 0) {
    throw new Error("Amounts cannot be negative");
  }
  if (totalMonths < 0 || monthsPaid < 0) {
    throw new Error("Months cannot be negative");
  }
  if (totalMonths > 0 && monthsPaid > totalMonths) {
    throw new Error("Months paid cannot exceed total months");
  }
  if (paidTillNow > startingBalance + 0.001) {
    throw new Error("Paid till now cannot exceed starting balance");
  }
}
