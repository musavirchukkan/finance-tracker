import { describe, expect, it } from "vitest";
import { formatINR, parseAmount, toNumber } from "@/lib/money";

describe("toNumber", () => {
  it("coerces strings and nullish values", () => {
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("nope")).toBe(0);
  });
});

describe("parseAmount", () => {
  it("parses currency formatting", () => {
    expect(parseAmount("₹1,250.50")).toBe(1250.5);
    expect(parseAmount(" 100 ")).toBe(100);
  });

  it("rejects invalid or negative amounts", () => {
    expect(() => parseAmount("abc")).toThrow("Invalid amount");
    expect(() => parseAmount("-5")).toThrow("Invalid amount");
  });
});

describe("formatINR", () => {
  it("formats numbers as INR currency", () => {
    expect(formatINR(1000)).toMatch(/1,000\.00/);
    expect(formatINR(null)).toMatch(/0\.00/);
  });
});
