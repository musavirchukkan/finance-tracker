import { describe, expect, it } from "vitest";
import {
  computeOutstanding,
  defaultPaymentTypeForAccount,
  isCreditCardEmiType,
  isCreditCardType,
  isCreditLineType,
  isKuriType,
  isNoInterestType,
  isRevolvingCreditType,
  paymentBalanceEffect,
  paymentOptionsForAccountType,
} from "@/lib/debt-kinds";

describe("type detectors", () => {
  it("detects kuri / chit", () => {
    expect(isKuriType("Kuri")).toBe(true);
    expect(isKuriType("chit fund")).toBe(true);
  });

  it("detects credit card rolling", () => {
    expect(isCreditCardType("Credit Card")).toBe(true);
    expect(isCreditCardType("Credit Card EMI")).toBe(false);
    expect(isCreditCardEmiType("Credit Card EMI")).toBe(true);
    expect(isCreditCardEmiType("CC EMI")).toBe(true);
    expect(isCreditCardEmiType("Personal Loan")).toBe(false);
  });

  it("treats credit line like a loan, not revolving", () => {
    expect(isCreditLineType("Credit Line")).toBe(true);
    expect(isRevolvingCreditType("Credit Line")).toBe(false);
    expect(defaultPaymentTypeForAccount("Credit Line")).toBe("EMI");
    expect(paymentOptionsForAccountType("Credit Line")).toEqual([
      "EMI",
      "Part payment",
      "Interest",
      "Other",
    ]);
  });

  it("detects no-interest monthly payments", () => {
    expect(isNoInterestType("Monthly payment")).toBe(true);
    expect(isNoInterestType("0% EMI")).toBe(true);
  });
});

describe("paymentBalanceEffect", () => {
  it("marks kuri payout and wallet cashout as payout", () => {
    expect(paymentBalanceEffect("Kuri payout")).toBe("payout");
    expect(paymentBalanceEffect("Wallet → bank")).toBe("payout");
  });

  it("marks wallet recharge as charge", () => {
    expect(paymentBalanceEffect("Wallet recharge")).toBe("charge");
    expect(paymentBalanceEffect("CC charge")).toBe("charge");
  });

  it("marks EMI and bill payment as paydown", () => {
    expect(paymentBalanceEffect("EMI")).toBe("paydown");
    expect(paymentBalanceEffect("Bill payment")).toBe("paydown");
    expect(paymentBalanceEffect("Contribution")).toBe("paydown");
  });
});

describe("computeOutstanding", () => {
  it("handles kuri contributions without counting payout", () => {
    const outstanding = computeOutstanding({
      startingBalance: 100_000,
      payments: [
        { amount: 10_000, isPaid: true, paymentType: "Contribution" },
        { amount: 10_000, isPaid: true, paymentType: "Contribution" },
        { amount: 100_000, isPaid: true, paymentType: "Kuri payout" },
      ],
    });
    expect(outstanding).toBe(80_000);
  });

  it("handles credit card rolling recharge + bill", () => {
    const outstanding = computeOutstanding({
      startingBalance: 20_000,
      payments: [
        { amount: 15_000, isPaid: true, paymentType: "Wallet recharge" },
        { amount: 15_000, isPaid: true, paymentType: "Wallet → bank" },
        { amount: 10_000, isPaid: true, paymentType: "Bill payment" },
      ],
    });
    // 20k + 15k charge − 10k bill; cashout ignored
    expect(outstanding).toBe(25_000);
  });

  it("reduces outstanding by principal only when split is present", () => {
    const outstanding = computeOutstanding({
      startingBalance: 30_000,
      payments: [
        {
          amount: 2646.61,
          isPaid: true,
          paymentType: "EMI",
          principalAmount: 2113.92,
        },
      ],
    });
    expect(outstanding).toBe(Math.round((30_000 - 2113.92) * 100) / 100);
  });
});

describe("paymentOptionsForAccountType", () => {
  it("returns kuri options", () => {
    expect(paymentOptionsForAccountType("Kuri")[0]).toBe("Contribution");
    expect(defaultPaymentTypeForAccount("Credit Card")).toBe("Bill payment");
  });
});
