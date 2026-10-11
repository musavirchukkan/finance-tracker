import { describe, expect, it } from "vitest";
import { bankBalanceDelta } from "@/lib/bank-account-cashflow";

describe("bankBalanceDelta", () => {
  it("debits expense from balance", () => {
    expect(bankBalanceDelta("expense", 250)).toBe(-250);
  });

  it("credits income to balance", () => {
    expect(bankBalanceDelta("income", 1000)).toBe(1000);
  });

  it("ignores zero amount", () => {
    expect(bankBalanceDelta("expense", 0)).toBe(0);
  });
});
