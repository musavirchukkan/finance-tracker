import { describe, expect, it } from "vitest";
import {
  activityLabel,
  clampBillingDay,
  dateForDayInMonth,
  daysInMonth,
  dueDateForBill,
  nextCycleDate,
  previousCycleDate,
  statementBillDateForCharge,
  summarizeCardStatement,
} from "@/lib/credit-cards";

describe("clampBillingDay", () => {
  it("accepts 1–31", () => {
    expect(clampBillingDay(1)).toBe(1);
    expect(clampBillingDay(31)).toBe(31);
  });

  it("rejects out of range", () => {
    expect(clampBillingDay(0)).toBeNull();
    expect(clampBillingDay(32)).toBeNull();
    expect(clampBillingDay(null)).toBeNull();
  });
});

describe("daysInMonth / dateForDayInMonth", () => {
  it("clamps 31 in February", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(dateForDayInMonth(2026, 1, 31).getDate()).toBe(28);
  });

  it("clamps 31 in April", () => {
    expect(dateForDayInMonth(2026, 3, 31).getDate()).toBe(30);
  });

  it("keeps 31 in January", () => {
    expect(dateForDayInMonth(2026, 0, 31).getDate()).toBe(31);
  });
});

describe("nextCycleDate", () => {
  it("returns same month when day is still ahead", () => {
    expect(nextCycleDate(20, new Date(2026, 2, 10))).toBe("2026-03-20");
  });

  it("rolls to next month when day already passed", () => {
    expect(nextCycleDate(5, new Date(2026, 2, 10))).toBe("2026-04-05");
  });

  it("uses last day of February for day 31", () => {
    expect(nextCycleDate(31, new Date(2026, 1, 1))).toBe("2026-02-28");
  });
});

describe("previousCycleDate", () => {
  it("returns last bill on or before today", () => {
    expect(previousCycleDate(15, new Date(2026, 2, 20))).toBe("2026-03-15");
    expect(previousCycleDate(15, new Date(2026, 2, 10))).toBe("2026-02-15");
  });
});

describe("dueDateForBill", () => {
  it("uses same month when due day is after bill day", () => {
    expect(dueDateForBill("2026-03-15", 25)).toBe("2026-03-25");
  });

  it("uses next month when due day is on or before bill day", () => {
    expect(dueDateForBill("2026-03-15", 5)).toBe("2026-04-05");
  });

  it("clamps due day in short months", () => {
    expect(dueDateForBill("2026-01-31", 31)).toBe("2026-02-28");
  });
});

describe("statementBillDateForCharge", () => {
  it("posts charge after bill date to next bill", () => {
    // Bill day 15: charge on 16 Mar → next bill 15 Apr
    expect(statementBillDateForCharge("2026-03-16", 15)).toBe("2026-04-15");
  });

  it("posts charge on bill date to that bill", () => {
    expect(statementBillDateForCharge("2026-03-15", 15)).toBe("2026-03-15");
  });

  it("posts charge before bill date to that month's bill", () => {
    expect(statementBillDateForCharge("2026-03-10", 15)).toBe("2026-03-15");
  });
});

describe("summarizeCardStatement", () => {
  it("puts post-bill charges on next bill and closed cycle as amount due", () => {
    const summary = summarizeCardStatement({
      billingDay: 15,
      paymentDueDay: 5,
      from: new Date(2026, 2, 20), // 20 Mar → last bill 15 Mar
      activities: [
        { date: "2026-02-20", activityType: "spend", outstandingDelta: 1000 },
        { date: "2026-03-10", activityType: "spend", outstandingDelta: 2000 },
        { date: "2026-03-16", activityType: "spend", outstandingDelta: 500 },
        {
          date: "2026-03-18",
          activityType: "bill_payment",
          outstandingDelta: -500,
        },
      ],
    });
    expect(summary.lastBillDate).toBe("2026-03-15");
    expect(summary.nextBillDate).toBe("2026-04-15");
    expect(summary.nextDueDate).toBe("2026-04-05");
    // closed: Feb 16–Mar 15 → 1000+2000 = 3000, paid 500 → due 2500
    expect(summary.amountDue).toBe(2500);
    expect(summary.nextBillPending).toBe(500);
  });
});

describe("activityLabel", () => {
  it("labels wallet recharge", () => {
    expect(activityLabel("wallet_recharge")).toBe("Wallet recharge");
  });
});
