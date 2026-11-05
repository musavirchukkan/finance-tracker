import { describe, expect, it } from "vitest";
import {
  bankBalanceDelta,
  ledgerBalanceEffects,
  normalizeTransferLegs,
} from "./bank-account-cashflow";
import { UserFacingError } from "./safe-error";

describe("bankBalanceDelta", () => {
  it("credits income and debits expense", () => {
    expect(bankBalanceDelta("income", 100)).toBe(100);
    expect(bankBalanceDelta("expense", 40)).toBe(-40);
  });
});

describe("normalizeTransferLegs", () => {
  it("accepts bank to bank with a positive amount", () => {
    expect(
      normalizeTransferLegs({
        fromBankAccountId: "from-id",
        toBankAccountId: "to-id",
        amount: 250,
      }),
    ).toEqual({
      fromBankAccountId: "from-id",
      toBankAccountId: "to-id",
      amount: 250,
    });
  });

  it("accepts cash deposit (cash → bank)", () => {
    expect(
      normalizeTransferLegs({
        fromBankAccountId: null,
        toBankAccountId: "bank-id",
        amount: 500,
      }),
    ).toEqual({
      fromBankAccountId: null,
      toBankAccountId: "bank-id",
      amount: 500,
    });
  });

  it("accepts cash withdrawal (bank → cash)", () => {
    expect(
      normalizeTransferLegs({
        fromBankAccountId: "bank-id",
        toBankAccountId: null,
        amount: 100,
      }),
    ).toEqual({
      fromBankAccountId: "bank-id",
      toBankAccountId: null,
      amount: 100,
    });
  });

  it("rejects zero or negative amounts", () => {
    expect(() =>
      normalizeTransferLegs({
        fromBankAccountId: "a",
        toBankAccountId: "b",
        amount: 0,
      }),
    ).toThrow(UserFacingError);
    expect(() =>
      normalizeTransferLegs({
        fromBankAccountId: "a",
        toBankAccountId: "b",
        amount: -10,
      }),
    ).toThrow(UserFacingError);
  });

  it("rejects cash → cash", () => {
    expect(() =>
      normalizeTransferLegs({
        fromBankAccountId: null,
        toBankAccountId: null,
        amount: 50,
      }),
    ).toThrow(UserFacingError);
  });

  it("rejects same from and to bank", () => {
    expect(() =>
      normalizeTransferLegs({
        fromBankAccountId: "same",
        toBankAccountId: "same",
        amount: 50,
      }),
    ).toThrow(UserFacingError);
  });
});

describe("ledgerBalanceEffects", () => {
  it("debits from and credits to for transfers", () => {
    const effects = ledgerBalanceEffects({
      type: "transfer",
      amount: 100,
      bankAccountId: "a",
      transferToBankAccountId: "b",
    });
    expect(effects.get("a")).toBe(-100);
    expect(effects.get("b")).toBe(100);
  });

  it("only debits from for bank → cash", () => {
    const effects = ledgerBalanceEffects({
      type: "transfer",
      amount: 40,
      bankAccountId: "a",
      transferToBankAccountId: null,
    });
    expect(effects.get("a")).toBe(-40);
    expect(effects.size).toBe(1);
  });

  it("delta from bank→cash to bank→bank only credits to", () => {
    const before = ledgerBalanceEffects({
      type: "transfer",
      amount: 100,
      bankAccountId: "a",
      transferToBankAccountId: null,
    });
    const after = ledgerBalanceEffects({
      type: "transfer",
      amount: 100,
      bankAccountId: "a",
      transferToBankAccountId: "b",
    });
    expect((after.get("b") ?? 0) - (before.get("b") ?? 0)).toBe(100);
    expect((after.get("a") ?? 0) - (before.get("a") ?? 0)).toBe(0);
  });
});
