import { describe, expect, it } from "vitest";
import {
  calendarDaysBetween,
  cardBillWarnings,
  emiPostedForBillDate,
  unpaidDebtPaymentWarnings,
} from "@/lib/emi-statement-post";

describe("calendarDaysBetween", () => {
  it("counts calendar days", () => {
    expect(calendarDaysBetween("2026-10-10", "2026-10-12")).toBe(2);
    expect(calendarDaysBetween("2026-10-12", "2026-10-10")).toBe(-2);
  });
});

describe("emiPostedForBillDate", () => {
  it("detects posted EMI for a bill date", () => {
    const payments = [
      {
        accountId: "d1",
        paymentType: "EMI posted to card",
        dueDate: "2026-09-20",
        isPaid: true,
      },
    ];
    expect(emiPostedForBillDate(payments, "d1", "2026-09-20")).toBe(true);
    expect(emiPostedForBillDate(payments, "d1", "2026-10-20")).toBe(false);
    expect(emiPostedForBillDate(payments, "d2", "2026-09-20")).toBe(false);
  });
});

describe("cardBillWarnings", () => {
  it("warns when bill is due today and unpaid", () => {
    const warnings = cardBillWarnings(
      [
        {
          id: "c1",
          label: "MyZone",
          amountDue: 5000,
          nextDueDate: "2026-10-10",
        },
      ],
      new Date(2026, 9, 10, 12, 0, 0),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("unpaid");
    expect(warnings[0]?.severity).toBe("warn");
  });

  it("marks urgent when due was 2+ days ago", () => {
    const warnings = cardBillWarnings(
      [
        {
          id: "c1",
          label: "MyZone",
          amountDue: 5000,
          nextDueDate: "2026-10-10",
        },
      ],
      new Date(2026, 9, 12, 12, 0, 0),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("overdue");
    expect(warnings[0]?.severity).toBe("urgent");
  });

  it("skips when nothing is due", () => {
    expect(
      cardBillWarnings(
        [{ id: "c1", label: "MyZone", amountDue: 0, nextDueDate: "2026-10-10" }],
        new Date(2026, 9, 15),
      ),
    ).toHaveLength(0);
  });

  it("skips when due date is still in the future", () => {
    expect(
      cardBillWarnings(
        [
          {
            id: "c1",
            label: "MyZone",
            amountDue: 5000,
            nextDueDate: "2026-10-20",
          },
        ],
        new Date(2026, 9, 10),
      ),
    ).toHaveLength(0);
  });
});

describe("unpaidDebtPaymentWarnings", () => {
  it("warns for unpaid EMI past due", () => {
    const warnings = unpaidDebtPaymentWarnings(
      [
        {
          id: "p1",
          accountId: "d1",
          accountName: "Phone loan",
          dueDate: "2026-10-01",
          paymentType: "EMI",
          amount: 2000,
          isPaid: false,
        },
      ],
      new Date(2026, 9, 1, 12, 0, 0),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("unpaid");
  });

  it("marks urgent when unpaid EMI is 2+ days late", () => {
    const warnings = unpaidDebtPaymentWarnings(
      [
        {
          id: "p1",
          accountId: "d1",
          accountName: "Phone loan",
          dueDate: "2026-10-01",
          paymentType: "EMI",
          amount: 2000,
          isPaid: false,
        },
      ],
      new Date(2026, 9, 5, 12, 0, 0),
    );
    expect(warnings[0]?.kind).toBe("overdue");
    expect(warnings[0]?.severity).toBe("urgent");
  });

  it("ignores EMI posted to card rows", () => {
    expect(
      unpaidDebtPaymentWarnings(
        [
          {
            id: "p1",
            accountId: "d1",
            accountName: "CC EMI",
            dueDate: "2026-09-20",
            paymentType: "EMI posted to card",
            amount: 1500,
            isPaid: true,
          },
        ],
        new Date(2026, 9, 15),
      ),
    ).toHaveLength(0);
  });
});
