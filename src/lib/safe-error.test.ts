import { describe, expect, it } from "vitest";
import { clientErrorMessage, UserFacingError } from "@/lib/safe-error";

describe("clientErrorMessage", () => {
  it("shows UserFacingError text", () => {
    expect(clientErrorMessage(new UserFacingError("Pick a category"))).toBe(
      "Pick a category",
    );
  });

  it("allows short validation Error messages", () => {
    expect(clientErrorMessage(new Error("Name is required"))).toBe(
      "Name is required",
    );
  });

  it("hides driver / stack-like messages", () => {
    expect(
      clientErrorMessage(
        new Error("neon connection failed SQLSTATE 08006"),
        "fallback",
      ),
    ).toBe("fallback");
  });
});
