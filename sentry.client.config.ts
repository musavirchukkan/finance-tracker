import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpBodies: [],
    urlQueryParams: false,
  },
  // No Session Replay for finance UI.
  integrations: (integrations) =>
    integrations.filter((i) => i.name !== "Replay"),
  beforeSend(event) {
    return scrubSentryEvent(
      event as unknown as Record<string, unknown>,
    ) as unknown as typeof event;
  },
});
