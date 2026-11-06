import { describe, expect, it } from "vitest";
import {
  affectsBankBalance,
  balanceAsOfNow,
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

describe("affectsBankBalance", () => {
  const asOf = new Date("2026-11-06T10:00:00.000Z");

  it("treats missing as-of as always affecting", () => {
    expect(affectsBankBalance(new Date("2020-01-01T00:00:00.000Z"), null)).toBe(
      true,
    );
  });

  it("includes the as-of instant itself", () => {
    expect(affectsBankBalance(asOf, asOf)).toBe(true);
  });

  it("excludes times before as-of", () => {
    expect(
      affectsBankBalance(new Date("2026-11-06T09:59:59.000Z"), asOf),
    ).toBe(false);
  });
});

describe("balanceAsOfNow", () => {
  it("truncates to whole seconds", () => {
    const stamped = balanceAsOfNow(new Date("2026-11-06T10:00:00.456Z"));
    expect(stamped.toISOString()).toBe("2026-11-06T10:00:00.000Z");
  });
});

describe("ledgerBalanceEffects with balance as-of", () => {
  const asOf = new Date("2026-11-06T10:00:00.000Z");
  const before = new Date("2026-11-06T09:00:00.000Z");
  const after = new Date("2026-11-06T11:00:00.000Z");

  it("skips expense before as-of", () => {
    const effects = ledgerBalanceEffects({
      type: "expense",
      amount: 50,
      bankAccountId: "a",
      occurredAt: before,
      balanceAsOfByAccount: new Map([["a", asOf]]),
    });
    expect(effects.size).toBe(0);
  });

  it("applies expense on or after as-of", () => {
    const effects = ledgerBalanceEffects({
      type: "expense",
      amount: 50,
      bankAccountId: "a",
      occurredAt: after,
      balanceAsOfByAccount: new Map([["a", asOf]]),
    });
    expect(effects.get("a")).toBe(-50);
  });

  it("edit crossing cutoff: before→after applies full new effect", () => {
    const asOfMap = new Map<string, Date>([["a", asOf]]);
    const oldEffects = ledgerBalanceEffects({
      type: "expense",
      amount: 40,
      bankAccountId: "a",
      occurredAt: before,
      balanceAsOfByAccount: asOfMap,
    });
    const newEffects = ledgerBalanceEffects({
      type: "expense",
      amount: 40,
      bankAccountId: "a",
      occurredAt: after,
      balanceAsOfByAccount: asOfMap,
    });
    expect((newEffects.get("a") ?? 0) - (oldEffects.get("a") ?? 0)).toBe(-40);
  });

  it("transfer legs respect each account as-of independently", () => {
    const asOfMap = new Map<string, Date | null | undefined>([
      ["from", asOf],
      ["to", new Date("2026-11-01T00:00:00.000Z")],
    ]);
    const effects = ledgerBalanceEffects({
      type: "transfer",
      amount: 100,
      bankAccountId: "from",
      transferToBankAccountId: "to",
      occurredAt: before,
      balanceAsOfByAccount: asOfMap,
    });
    expect(effects.has("from")).toBe(false);
    expect(effects.get("to")).toBe(100);
  });
});
