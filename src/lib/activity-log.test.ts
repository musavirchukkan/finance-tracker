import { describe, expect, it } from "vitest";
import {
  summarizeTransactionActivity,
  transactionActivitySnapshot,
} from "@/lib/activity-log";

describe("transactionActivitySnapshot", () => {
  it("normalizes nullish fields", () => {
    expect(
      transactionActivitySnapshot({
        type: "transfer",
        amount: 500,
        bankAccountId: "a",
        transferToBankAccountId: null,
      }),
    ).toEqual({
      type: "transfer",
      amount: 500,
      date: null,
      description: null,
      categoryId: null,
      bankAccountId: "a",
      transferToBankAccountId: null,
      creditCardId: null,
      cardBillPayId: null,
    });
  });

  it("folds occurredAt into date so time edits show on the same field", () => {
    expect(
      transactionActivitySnapshot({
        type: "expense",
        amount: 42,
        date: "2026-11-09",
        occurredAt: new Date("2026-11-09T07:15:30.000Z"),
      }).date,
    ).toBe("2026-11-09T07:15:30.000Z");
  });
});

describe("summarizeTransactionActivity", () => {
  it("describes bank → cash transfer", () => {
    const summary = summarizeTransactionActivity({
      verb: "Created",
      snapshot: {
        type: "transfer",
        amount: 500,
        bankAccountId: "from-id",
        transferToBankAccountId: null,
      },
    });
    expect(summary).toContain("Created transfer");
    expect(summary).toContain("bank → cash");
    expect(summary).toMatch(/500/);
  });

  it("describes bank → bank transfer update", () => {
    const summary = summarizeTransactionActivity({
      verb: "Updated",
      snapshot: {
        type: "transfer",
        amount: 250.5,
        bankAccountId: "a",
        transferToBankAccountId: "b",
      },
    });
    expect(summary).toContain("Updated transfer");
    expect(summary).toContain("bank → bank");
  });

  it("describes expense delete", () => {
    const summary = summarizeTransactionActivity({
      verb: "Deleted",
      snapshot: { type: "expense", amount: 99 },
    });
    expect(summary).toContain("Deleted expense");
    expect(summary).toMatch(/99/);
  });
});
