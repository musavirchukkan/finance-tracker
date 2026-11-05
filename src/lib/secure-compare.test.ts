import { describe, expect, it } from "vitest";
import { secureStringEqual } from "@/lib/secure-compare";

describe("secureStringEqual", () => {
  it("matches equal strings", () => {
    expect(secureStringEqual("invite-code", "invite-code")).toBe(true);
  });

  it("rejects unequal strings", () => {
    expect(secureStringEqual("invite-code", "wrong")).toBe(false);
    expect(secureStringEqual("abc", "abcd")).toBe(false);
  });
});
