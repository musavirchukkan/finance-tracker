import { describe, expect, it } from "vitest";
import { isBudgetableCategoryName } from "./budget-categories";

describe("isBudgetableCategoryName", () => {
  it("allows normal spend categories", () => {
    expect(isBudgetableCategoryName("Food")).toBe(true);
    expect(isBudgetableCategoryName("Travel")).toBe(true);
    expect(isBudgetableCategoryName("Card fees")).toBe(true);
    expect(isBudgetableCategoryName("Bank charges")).toBe(true);
    expect(isBudgetableCategoryName("Other")).toBe(true);
  });

  it("blocks debt and transfer categories", () => {
    expect(isBudgetableCategoryName("Debt / EMI")).toBe(false);
    expect(isBudgetableCategoryName("Lent")).toBe(false);
    expect(isBudgetableCategoryName("Kuri")).toBe(false);
    expect(isBudgetableCategoryName("Credit Card")).toBe(false);
    expect(isBudgetableCategoryName("Wallet cashout")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isBudgetableCategoryName("debt / emi")).toBe(false);
    expect(isBudgetableCategoryName("KURI")).toBe(false);
  });
});
