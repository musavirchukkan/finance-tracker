import { describe, expect, it } from "vitest";
import {
  localWallClockToUtcIso,
  parseUtcInstant,
  utcIsoToLocalFields,
} from "@/lib/utc-time";

describe("parseUtcInstant", () => {
  it("keeps zoned instants as UTC", () => {
    expect(parseUtcInstant("2026-03-01T10:00:00.000Z").toISOString()).toBe(
      "2026-03-01T10:00:00.000Z",
    );
    expect(parseUtcInstant("2026-03-01T15:30:00+05:30").toISOString()).toBe(
      "2026-03-01T10:00:00.000Z",
    );
  });

  it("treats a zone-less clock time as UTC", () => {
    expect(parseUtcInstant("2026-03-01T10:00:00").toISOString()).toBe(
      "2026-03-01T10:00:00.000Z",
    );
  });
});

describe("local wall clock", () => {
  it("round-trips the time the user picked", () => {
    const iso = localWallClockToUtcIso("2026-06-15", "09:45");
    expect(iso).toBeTruthy();
    expect(utcIsoToLocalFields(iso!)).toEqual({
      date: "2026-06-15",
      time: "09:45",
    });
    expect(iso).toBe(new Date(2026, 5, 15, 9, 45, 0, 0).toISOString());
  });

  it("rejects an impossible calendar day", () => {
    expect(localWallClockToUtcIso("2026-02-31", "10:00")).toBeNull();
  });
});
