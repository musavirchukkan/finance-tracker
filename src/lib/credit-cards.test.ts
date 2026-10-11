import { describe, expect, it } from "vitest";
import {
  activityLabel,
  clampBillingDay,
  nextCycleDate,
} from "@/lib/credit-cards";

describe("clampBillingDay", () => {
  it("accepts 1–28", () => {
    expect(clampBillingDay(1)).toBe(1);
    expect(clampBillingDay(28)).toBe(28);
  });

  it("rejects out of range", () => {
    expect(clampBillingDay(0)).toBeNull();
    expect(clampBillingDay(29)).toBeNull();
    expect(clampBillingDay(null)).toBeNull();
  });
});

describe("nextCycleDate", () => {
  it("returns same month when day is still ahead", () => {
    expect(nextCycleDate(20, new Date(2026, 2, 10))).toBe("2026-03-20");
  });

  it("rolls to next month when day already passed", () => {
    expect(nextCycleDate(5, new Date(2026, 2, 10))).toBe("2026-04-05");
  });
});

describe("activityLabel", () => {
  it("labels wallet recharge", () => {
    expect(activityLabel("wallet_recharge")).toBe("Wallet recharge");
  });
});
