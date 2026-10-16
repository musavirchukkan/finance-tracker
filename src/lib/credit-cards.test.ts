import { describe, expect, it } from "vitest";
import {
  activityLabel,
  availableCredit,
  availableCreditForSharedLimit,
  clampBillingDay,
  dateForDayInMonth,
  daysInMonth,
  dueDateForBill,
  dueDateFromBill,
  estimateDueGapDays,
  formatCardLabel,
  nextCycleDate,
  normalizeLastFour,
  previousCycleDate,
  resolveLimitRootId,
  sharedLimitMemberIds,
  statementBillDateForCharge,
  summarizeCardStatement,
  totalDueThisCycle,
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
      paymentDueGapDays: 21, // 15 Mar + 21 → 5 Apr
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

  it("uses current outstanding when there are no charge activities", () => {
    const summary = summarizeCardStatement({
      billingDay: 25,
      paymentDueGapDays: 15, // 25 Sep + 15 → 10 Oct
      from: new Date(2026, 9, 5), // 5 Oct — due for Sept bill is still ahead (10 Oct)
      currentOutstanding: 12_000,
      activities: [],
    });
    expect(summary.amountDue).toBe(12_000);
    expect(summary.nextDueDate).toBe("2026-10-10");
  });

  it("keeps outstanding on current bill when due is past but still unpaid", () => {
    // Bill day 25, gap 15: last bill 25 Sep → due 10 Oct. Today 12 Oct → past,
    // but outstanding remains due on that cycle (do not advance away).
    const summary = summarizeCardStatement({
      billingDay: 25,
      paymentDueGapDays: 15,
      from: new Date(2026, 9, 12),
      currentOutstanding: 8_000,
      activities: [],
    });
    expect(summary.lastBillDate).toBe("2026-09-25");
    expect(summary.nextDueDate).toBe("2026-10-10");
    expect(summary.amountDue).toBe(8_000);
  });

  it("splits statement amount vs next-bill leftover", () => {
    const summary = summarizeCardStatement({
      billingDay: 13,
      paymentDueGapDays: 20,
      from: new Date(2026, 9, 17), // 17 Oct — after bill day 13
      currentOutstanding: 20_000,
      statementAmount: 16_000,
      pinToCurrentStatement: true,
      activities: [],
    });
    expect(summary.lastBillDate).toBe("2026-10-13");
    expect(summary.nextDueDate).toBe("2026-11-02");
    expect(summary.amountDue).toBe(16_000);
    expect(summary.nextBillPending).toBe(4_000);
  });

  it("pins full outstanding to current bill mid-cycle", () => {
    const summary = summarizeCardStatement({
      billingDay: 13,
      paymentDueGapDays: 20,
      from: new Date(2026, 9, 17),
      currentOutstanding: 12_500,
      pinToCurrentStatement: true,
      activities: [],
    });
    expect(summary.amountDue).toBe(12_500);
    expect(summary.nextDueDate).toBe("2026-11-02");
  });
});

describe("dueDateFromBill", () => {
  it("adds calendar days across month ends", () => {
    expect(dueDateFromBill("2026-09-20", 20)).toBe("2026-10-10");
    expect(dueDateFromBill("2026-01-31", 20)).toBe("2026-02-20");
  });

  it("estimates gap from legacy due day-of-month", () => {
    expect(estimateDueGapDays(20, 8)).toBeGreaterThanOrEqual(18);
    expect(estimateDueGapDays(20, 8)).toBeLessThanOrEqual(20);
  });
});

describe("activityLabel", () => {
  it("labels wallet recharge", () => {
    expect(activityLabel("wallet_recharge")).toBe("Card → wallet");
  });

  it("labels EMI posted", () => {
    expect(activityLabel("emi_posted")).toBe("EMI posted");
  });
});

describe("formatCardLabel / normalizeLastFour", () => {
  it("appends last four when valid", () => {
    expect(formatCardLabel("HDFC", "4821")).toBe("HDFC ···· 4821");
    expect(normalizeLastFour("12-34")).toBe("1234");
  });

  it("omits incomplete last four", () => {
    expect(formatCardLabel("HDFC", "12")).toBe("HDFC");
    expect(normalizeLastFour("12")).toBeNull();
  });
});

describe("availableCredit", () => {
  it("blocks limit by revolving + EMI remaining", () => {
    expect(
      availableCredit({
        creditLimit: 50_000,
        revolvingOutstanding: 0,
        emiBlocked: 25_000,
      }),
    ).toBe(25_000);
  });

  it("goes negative when used exceeds the limit", () => {
    expect(
      availableCredit({
        creditLimit: 50_000,
        revolvingOutstanding: 40_000,
        emiBlocked: 15_000,
      }),
    ).toBe(-5_000);
  });

  it("returns null without a limit", () => {
    expect(
      availableCredit({
        creditLimit: null,
        revolvingOutstanding: 1000,
        emiBlocked: 500,
      }),
    ).toBeNull();
  });
});

describe("shared credit limit", () => {
  const cards = [
    {
      id: "myzone",
      name: "Axis My Zone",
      creditLimit: "100000",
      currentOutstanding: "10000",
      sharesLimitWithId: null,
    },
    {
      id: "indianoil",
      name: "Axis IndianOil",
      creditLimit: null,
      currentOutstanding: "5000",
      sharesLimitWithId: "myzone",
    },
    {
      id: "value",
      name: "Axis Value",
      creditLimit: null,
      currentOutstanding: "0",
      sharesLimitWithId: "myzone",
    },
  ];

  it("resolves add-on cards to the limit owner", () => {
    expect(resolveLimitRootId("indianoil", cards)).toBe("myzone");
    expect(resolveLimitRootId("myzone", cards)).toBe("myzone");
  });

  it("lists all members of the shared pool", () => {
    expect(sharedLimitMemberIds("value", cards).sort()).toEqual([
      "indianoil",
      "myzone",
      "value",
    ]);
  });

  it("reduces available on every card when one has EMI", () => {
    const emiBlockedByCard = {
      myzone: 0,
      indianoil: 40_000,
      value: 0,
    };
    // limit 100000 − revolving 15000 − EMI 40000 = 45000
    expect(
      availableCreditForSharedLimit({
        cardId: "myzone",
        cards,
        emiBlockedByCard,
      }),
    ).toBe(45_000);
    expect(
      availableCreditForSharedLimit({
        cardId: "value",
        cards,
        emiBlockedByCard,
      }),
    ).toBe(45_000);
  });
});

describe("totalDueThisCycle", () => {
  it("adds statement due and monthly EMI", () => {
    expect(
      totalDueThisCycle({ statementDue: 3000, linkedMonthlyEmi: 2500 }),
    ).toBe(5500);
  });

  it("ignores paid-off EMI (zero monthly)", () => {
    expect(
      totalDueThisCycle({ statementDue: 3000, linkedMonthlyEmi: 0 }),
    ).toBe(3000);
  });
});
