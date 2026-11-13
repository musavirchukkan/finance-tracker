import { describe, expect, it } from "vitest";
import {
  buildTransactionsHref,
  encodePaidFromParam,
  parsePaidFromParam,
} from "./transaction-filters";

describe("parsePaidFromParam", () => {
  it("parses bank and card filters", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(parsePaidFromParam(`bank:${id}`)).toEqual({ kind: "bank", id });
    expect(parsePaidFromParam(`card:${id}`)).toEqual({ kind: "card", id });
  });

  it("rejects invalid values", () => {
    expect(parsePaidFromParam(undefined)).toBeUndefined();
    expect(parsePaidFromParam("bank:not-a-uuid")).toBeUndefined();
    expect(parsePaidFromParam("wallet:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBeUndefined();
  });
});

describe("buildTransactionsHref", () => {
  it("includes paid-from and drops defaults", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(
      buildTransactionsHref({
        month: "2026-11",
        type: "all",
        paidFrom: { kind: "bank", id },
      }),
    ).toBe(`/transactions?month=2026-11&from=${encodeURIComponent(`bank:${id}`)}`);

    expect(
      buildTransactionsHref({
        month: "2026-11",
        type: "expense",
        category: id,
        paidFrom: encodePaidFromParam({ kind: "card", id }),
        page: 2,
      }),
    ).toContain("type=expense");
  });
});
