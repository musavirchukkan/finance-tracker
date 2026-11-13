"use client";

import { useSyncExternalStore } from "react";
import { formatUtcAsLocal } from "@/lib/utc-time";

/** Renders a UTC instant in the browser's local timezone. */
export function LocalDateTime({
  iso,
  seconds = false,
}: {
  iso: string;
  /** Include seconds (e.g. activity / balance-as-of anchors). */
  seconds?: boolean;
}) {
  const label = useSyncExternalStore(
    () => () => {},
    () => formatUtcAsLocal(iso, { seconds }),
    // Same formatter on the server so date+time is visible before hydrate.
    () => formatUtcAsLocal(iso, { seconds }),
  );

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label}
    </time>
  );
}
