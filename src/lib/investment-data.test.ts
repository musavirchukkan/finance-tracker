import { describe, expect, it } from "vitest";
import { buildNetWorth } from "@/lib/investment-data";

describe("buildNetWorth", () => {
  it("aggregates assets and liabilities without double-counting", () => {
    const result = buildNetWorth({
      banks: [
        {
          balanceNum: 1000,
        } as Awaited<
          ReturnType<typeof import("@/lib/bank-data").listBankAccounts>
        >[number],
      ],
      cards: [
        {
          outstandingNum: 200,
        } as Awaited<
          ReturnType<typeof import("@/lib/card-data").listCreditCards>
        >[number],
      ],
      debt: {
        totals: { pending: 300 },
        accounts: [{ id: "1" }],
      } as Awaited<
        ReturnType<typeof import("@/lib/debt-data").getDebtDashboard>
      >,
      holdings: [
        {
          type: "stock",
          valueNum: 500,
          costNum: 400,
        } as Awaited<
          ReturnType<typeof import("@/lib/investment-data").listInvestments>
        >[number],
      ],
    });

    expect(result.assets.total).toBe(1500);
    expect(result.liabilities.total).toBe(500);
    expect(result.netWorth).toBe(1000);
    expect(result.bankCount).toBe(1);
    expect(result.cardCount).toBe(1);
    expect(result.debtAccountCount).toBe(1);
  });
});
