import { describe, expect, it } from "vitest";
import { buildPayoffCurve, monthsBetween } from "@/lib/debt-projection";

describe("monthsBetween", () => {
  it("counts calendar months", () => {
    expect(monthsBetween("2026-01", "2026-04")).toBe(3);
  });
});

describe("buildPayoffCurve", () => {
  it("projects debt to zero by goal month", () => {
    const points = buildPayoffCurve({
      totalStartingDebt: 1000,
      goalPayoffDate: "2026-03-15",
      baselineMonth: "2026-01",
      paymentsByMonth: {
        "2026-01": 100,
        "2026-02": 200,
      },
    });

    expect(points[0]?.projected).toBe(1000);
    expect(points.at(-1)?.projected).toBe(0);
    expect(points[0]?.actual).toBe(900);
  });
});
