export const PAID_TO_DATE_TYPE = "Paid to date";

export function computePaidTillNow(emi: number, monthsPaid: number): number {
  const e = Math.max(0, emi);
  const m = Math.max(0, Math.floor(monthsPaid));
  return Math.round(e * m * 100) / 100;
}

/** Equal installment: starting ÷ total months (2 decimal places). */
export function computeMonthlyEmi(
  startingBalance: number,
  totalMonths: number,
): number {
  const months = Math.floor(totalMonths);
  if (startingBalance <= 0 || months <= 0) return 0;
  return Math.round((startingBalance / months) * 100) / 100;
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
