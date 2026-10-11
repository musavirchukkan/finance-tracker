export const PAID_TO_DATE_TYPE = "Paid to date";

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
