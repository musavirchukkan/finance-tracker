import {
  addMonths,
  differenceInCalendarMonths,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { monthRangeInclusive } from "./months";

export type PayoffPoint = {
  month: string; // YYYY-MM or "Baseline"
  label: string;
  projected: number;
  actual: number | null;
};

function monthLabel(ym: string): string {
  const d = parseISO(ym + "-01");
  return format(d, "MMMM yyyy");
}

/**
 * Linear projected path from totalStartingDebt at baseline month → 0 at goal month.
 * Actual remaining: starting − cumulative paid through end of that month.
 */
export function buildPayoffCurve(args: {
  totalStartingDebt: number;
  goalPayoffDate: string; // ISO date
  baselineMonth: string; // YYYY-MM
  paymentsByMonth: Record<string, number>; // YYYY-MM → paid sum
}): PayoffPoint[] {
  const { totalStartingDebt, goalPayoffDate, baselineMonth, paymentsByMonth } =
    args;

  const goalYm = goalPayoffDate.slice(0, 7);
  const months = monthRangeInclusive(baselineMonth, goalYm);
  if (months.length === 0) {
    return [
      {
        month: "Baseline",
        label: "Baseline",
        projected: totalStartingDebt,
        actual: totalStartingDebt,
      },
    ];
  }

  const steps = Math.max(1, months.length - 1);
  let cumulativePaid = 0;
  const todayYm = format(new Date(), "yyyy-MM");

  return months.map((ym, index) => {
    const projected = Math.max(
      0,
      totalStartingDebt - (totalStartingDebt * index) / steps,
    );
    cumulativePaid += paymentsByMonth[ym] ?? 0;
    const actualRemaining = Math.max(0, totalStartingDebt - cumulativePaid);
    const isFuture = ym > todayYm;

    return {
      month: index === 0 ? "Baseline" : ym,
      label: index === 0 ? "Baseline" : monthLabel(ym),
      projected: Math.round(projected * 100) / 100,
      actual: isFuture && index > 0 ? null : Math.round(actualRemaining * 100) / 100,
    };
  });
}

export function defaultGoalDate(monthsAhead = 18): string {
  return format(addMonths(startOfMonth(new Date()), monthsAhead), "yyyy-MM-dd");
}

export function monthsBetween(startYm: string, endYm: string): number {
  const a = startOfMonth(parseISO(startYm + "-01"));
  const b = startOfMonth(parseISO(endYm + "-01"));
  return differenceInCalendarMonths(b, a);
}
