"use client";

import { useSyncExternalStore } from "react";
import { formatUtcAsLocal } from "@/lib/utc-time";

/** Renders a UTC instant in the browser's local timezone. */
export function LocalDateTime({
  iso,
  seconds = false,
}: {
  iso: string;
  /** Include seconds (e.g. balance-as-of anchors). */
  seconds?: boolean;
}) {
  const label = useSyncExternalStore(
    () => () => {},
    () => formatUtcAsLocal(iso, { seconds }),
    () => "—",
  );

  return <time dateTime={iso}>{label}</time>;
}
