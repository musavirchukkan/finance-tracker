/**
 * Shared Sentry beforeSend scrubbing — strip money/PII-ish extras.
 * Keep stack traces; drop request bodies and known financial keys.
 */

const SENSITIVE_KEY =
  /(?:password|secret|token|authorization|cookie|amount|balance|outstanding|description|email)/i;

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[Filtered]" : scrubValue(v);
    }
    return out;
  }
  return value;
}

/** Apply to Sentry Event-like objects (duck-typed to avoid hard coupling in tests). */
export function scrubSentryEvent<T extends Record<string, unknown>>(
  event: T,
): T {
  const next = { ...event } as Record<string, unknown>;

  if (next.request && typeof next.request === "object") {
    const req = { ...(next.request as Record<string, unknown>) };
    delete req.cookies;
    delete req.data;
    if (req.headers && typeof req.headers === "object") {
      const headers = { ...(req.headers as Record<string, unknown>) };
      for (const key of Object.keys(headers)) {
        if (/cookie|authorization|auth/i.test(key)) {
          headers[key] = "[Filtered]";
        }
      }
      req.headers = headers;
    }
    next.request = req;
  }

  if (next.extra && typeof next.extra === "object") {
    next.extra = scrubValue(next.extra);
  }
  if (next.contexts && typeof next.contexts === "object") {
    next.contexts = scrubValue(next.contexts);
  }

  return next as T;
}
