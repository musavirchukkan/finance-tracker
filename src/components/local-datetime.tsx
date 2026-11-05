"use client";

import { useSyncExternalStore } from "react";
import { formatUtcAsLocal } from "@/lib/utc-time";

/** Renders a UTC instant in the browser's local timezone. */
export function LocalDateTime({ iso }: { iso: string }) {
  const label = useSyncExternalStore(
    () => () => {},
    () => formatUtcAsLocal(iso),
    () => "—",
  );

  return <time dateTime={iso}>{label}</time>;
}
