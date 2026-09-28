import {
  addMonths,
  differenceInCalendarMonths,
  endOfMonth,
  format,
  parse,
  startOfMonth,
} from "date-fns";

export function currentYearMonth(): string {
  return format(new Date(), "yyyy-MM");
}

/** Inclusive date bounds for a YYYY-MM month (valid calendar days). */
export function monthDateBounds(yearMonth: string): {
  start: string;
  end: string;
} {
  const startDate = parse(yearMonth + "-01", "yyyy-MM-dd", new Date());
  return {
    start: format(startDate, "yyyy-MM-dd"),
    end: format(endOfMonth(startDate), "yyyy-MM-dd"),
  };
}

export function formatYearMonthLabel(yearMonth: string): string {
  const d = parse(yearMonth + "-01", "yyyy-MM-dd", new Date());
  return format(d, "MMMM yyyy");
}

export function shiftYearMonth(yearMonth: string, delta: number): string {
  const d = parse(yearMonth + "-01", "yyyy-MM-dd", new Date());
  return format(addMonths(d, delta), "yyyy-MM");
}

export function monthRangeInclusive(
  startYm: string,
  endYm: string,
): string[] {
  const start = startOfMonth(parse(startYm + "-01", "yyyy-MM-dd", new Date()));
  const end = startOfMonth(parse(endYm + "-01", "yyyy-MM-dd", new Date()));
  const count = Math.max(0, differenceInCalendarMonths(end, start));
  const months: string[] = [];
  for (let i = 0; i <= count; i++) {
    months.push(format(addMonths(start, i), "yyyy-MM"));
  }
  return months;
}

export function yearMonthFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}
