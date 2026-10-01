import { describe, expect, it } from "vitest";
import {
  formatYearMonthLabel,
  monthDateBounds,
  monthRangeInclusive,
  shiftYearMonth,
  yearMonthFromDate,
} from "@/lib/months";

describe("monthDateBounds", () => {
  it("returns inclusive calendar bounds", () => {
    expect(monthDateBounds("2026-02")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
});

describe("shiftYearMonth", () => {
  it("shifts months across year boundaries", () => {
    expect(shiftYearMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftYearMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthRangeInclusive", () => {
  it("lists months from start to end", () => {
    expect(monthRangeInclusive("2026-01", "2026-03")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });
});

describe("formatYearMonthLabel", () => {
  it("returns a readable month label", () => {
    expect(formatYearMonthLabel("2026-09")).toBe("September 2026");
  });
});

describe("yearMonthFromDate", () => {
  it("extracts YYYY-MM", () => {
    expect(yearMonthFromDate("2026-09-15")).toBe("2026-09");
  });
});
