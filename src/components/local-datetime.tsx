"use client";

import { useEffect, useState } from "react";
import { formatUtcAsLocal } from "@/lib/utc-time";

/** Renders a UTC instant in the browser's local timezone. */
export function LocalDateTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(formatUtcAsLocal(iso));
  }, [iso]);

  return <time dateTime={iso}>{label ?? "—"}</time>;
}
