import { describe, expect, it } from "vitest";
import {
  computeFlatAnnualInterestPercent,
  computeGstOnInterest,
  computeMonthlyEmi,
  computeMonthlyEmiFromInterestPercent,
  computeMonthlyInterest,
  computePaidTillNow,
  computeReducingMonthlyEmi,
  computeSuggestedEmiPi,
  computeTotalInterest,
  rebuildFromSchedule,
  remainingBalance,
  remainingMonths,
  suggestInstallmentSplit,
  validateDebtTenure,
} from "@/lib/debt-account";

describe("computePaidTillNow", () => {
  it("multiplies EMI by months paid", () => {
    expect(computePaidTillNow(5000, 8)).toBe(40000);
  });

  it("rounds to two decimals", () => {
    expect(computePaidTillNow(3333.33, 3)).toBe(9999.99);
  });
});

describe("computeMonthlyEmi", () => {
  it("divides starting by total months", () => {
    expect(computeMonthlyEmi(120000, 12)).toBe(10000);
  });

  it("rounds to two decimals", () => {
    expect(computeMonthlyEmi(100000, 3)).toBe(33333.33);
  });

  it("returns 0 when months missing", () => {
    expect(computeMonthlyEmi(100000, 0)).toBe(0);
  });
});

describe("interest helpers", () => {
  it("treats EMI above principal installment as interest", () => {
    expect(
      computeTotalInterest({
        startingBalance: 120000,
        totalMonths: 12,
        monthlyEmi: 11000,
      }),
    ).toBe(12000);
    expect(
      computeMonthlyInterest({
        startingBalance: 120000,
        totalMonths: 12,
        monthlyEmi: 11000,
      }),
    ).toBe(1000);
  });

  it("derives flat annual percent from EMI", () => {
    expect(
      computeFlatAnnualInterestPercent({
        startingBalance: 120000,
        totalMonths: 12,
        monthlyEmi: 11000,
      }),
    ).toBe(10);
  });

  it("builds EMI from flat annual percent", () => {
    expect(
      computeMonthlyEmiFromInterestPercent({
        startingBalance: 120000,
        totalMonths: 12,
        interestPercent: 10,
      }),
    ).toBe(11000);
  });

  it("builds reducing-balance EMI", () => {
    const emi = computeReducingMonthlyEmi({
      startingBalance: 100_000,
      totalMonths: 12,
      interestPercent: 18,
    });
    expect(emi).toBeGreaterThan(8000);
    expect(emi).toBeLessThan(10_000);
  });

  it("routes suggested EMI by interest type", () => {
    const fixed = computeSuggestedEmiPi({
      startingBalance: 120000,
      totalMonths: 12,
      interestPercent: 10,
      interestType: "fixed",
    });
    const reducing = computeSuggestedEmiPi({
      startingBalance: 120000,
      totalMonths: 12,
      interestPercent: 10,
      interestType: "reducing",
    });
    expect(fixed).toBe(11000);
    expect(reducing).not.toBe(fixed);
  });

  it("applies 18% GST on interest", () => {
    expect(computeGstOnInterest(180.63, 18)).toBe(32.51);
    expect(computeGstOnInterest(451.43, 18)).toBe(81.26);
  });

  it("suggests installment split for reducing EMI", () => {
    const split = suggestInstallmentSplit({
      remainingPrincipal: 30_784.2,
      interestPercent: 17.6,
      interestType: "reducing",
      emiPi: 2565.35,
      gstPercent: 18,
    });
    expect(split.interest).toBeGreaterThan(400);
    expect(split.interest).toBeLessThan(500);
    expect(split.gst).toBeCloseTo(split.interest * 0.18, 1);
    expect(split.principal + split.interest).toBeCloseTo(2565.35, 1);
  });

  it("rebuilds Axis-style schedule after 11 EMIs", () => {
    const rebuilt = rebuildFromSchedule({
      startingBalance: 51_384.88,
      monthlyEmi: 2565.35,
      interestPercent: 18,
      interestType: "reducing",
      monthsPaid: 11,
      totalMonths: 24,
      gstPercent: 18,
    });
    expect(rebuilt.remaining).toBeCloseTo(30_095.33, 1);
    expect(rebuilt.next?.interest).toBeCloseTo(451.43, 1);
    expect(rebuilt.next?.principal).toBeCloseTo(2113.92, 1);
    expect(rebuilt.next?.gst).toBeCloseTo(81.26, 1);
    expect(rebuilt.next?.total).toBeCloseTo(2646.61, 1);
    expect(rebuilt.completed).toHaveLength(11);
  });
});

describe("remainingMonths", () => {
  it("subtracts paid from total", () => {
    expect(remainingMonths(24, 8)).toBe(16);
  });

  it("never goes below zero", () => {
    expect(remainingMonths(6, 10)).toBe(0);
  });
});

describe("remainingBalance", () => {
  it("subtracts paid from starting", () => {
    expect(remainingBalance(100000, 40000)).toBe(60000);
  });
});

describe("validateDebtTenure", () => {
  it("rejects months paid over total", () => {
    expect(() =>
      validateDebtTenure({
        startingBalance: 100,
        monthlyEmi: 10,
        totalMonths: 5,
        monthsPaid: 6,
        paidTillNow: 60,
      }),
    ).toThrow(/months paid/i);
  });

  it("rejects paid over starting", () => {
    expect(() =>
      validateDebtTenure({
        startingBalance: 100,
        monthlyEmi: 10,
        totalMonths: 12,
        monthsPaid: 5,
        paidTillNow: 150,
      }),
    ).toThrow(/exceed starting/i);
  });
});
