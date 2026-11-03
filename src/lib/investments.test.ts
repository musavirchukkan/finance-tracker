import { describe, expect, it } from "vitest";
import {
  holdingCost,
  holdingGain,
  holdingValue,
  isInvestmentType,
} from "@/lib/investments";

describe("holdingValue", () => {
  it("multiplies quantity by price", () => {
    expect(holdingValue(10, 123.45)).toBe(1234.5);
  });
});

describe("holdingCost / gain", () => {
  it("returns null cost without avg buy", () => {
    expect(holdingCost(10, null)).toBeNull();
    expect(holdingGain(1200, null)).toBeNull();
  });

  it("computes gain vs cost basis", () => {
    expect(holdingCost(10, 100)).toBe(1000);
    expect(holdingGain(1200, 1000)).toEqual({ amount: 200, pct: 20 });
  });
});

describe("isInvestmentType", () => {
  it("accepts known types", () => {
    expect(isInvestmentType("stock")).toBe(true);
    expect(isInvestmentType("mutual_fund")).toBe(true);
    expect(isInvestmentType("crypto")).toBe(false);
  });
});
