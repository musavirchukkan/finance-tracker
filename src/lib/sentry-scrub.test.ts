import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

describe("scrubSentryEvent", () => {
  it("strips cookies and request bodies", () => {
    const scrubbed = scrubSentryEvent({
      request: {
        cookies: { session: "abc" },
        data: { amount: 100, description: "secret lunch" },
        headers: {
          cookie: "session=abc",
          "content-type": "application/json",
        },
      },
      extra: { amount: 42, note: "ok" },
    });

    expect(scrubbed.request).toEqual({
      headers: {
        cookie: "[Filtered]",
        "content-type": "application/json",
      },
    });
    expect(scrubbed.extra).toEqual({
      amount: "[Filtered]",
      note: "ok",
    });
  });
});
