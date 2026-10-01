import { describe, expect, it } from "vitest";
import {
  computePaidTillNow,
  remainingBalance,
  remainingMonths,
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
