import { describe, expect, it } from "vitest";
import { transactionsToCsv } from "./export-transactions";

describe("transactionsToCsv", () => {
  it("writes a header and escaped rows", () => {
    const csv = transactionsToCsv([
      {
        date: "2026-03-01",
        occurredAt: "2026-03-01T10:00:00.000Z",
        description: 'Lunch, "cafe"',
        category: "Food",
        type: "expense",
        amount: "250.50",
      },
    ]);

    expect(csv).toBe(
      [
        "date,occurred_at,description,category,type,amount",
        '2026-03-01,2026-03-01T10:00:00.000Z,"Lunch, ""cafe""",Food,expense,250.50',
        "",
      ].join("\n"),
    );
  });
});
