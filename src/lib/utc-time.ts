function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Calendar day in the runtime's timezone. Use this in the browser. */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Clock time HH:mm in the runtime's timezone. Use this in the browser. */
export function nowTimeLocal(now = new Date()): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * The date and time the user picked, read as their local wall clock,
 * returned as a UTC ISO instant (`YYYY-MM-DDTHH:mm:ss.sssZ`).
 */
export function localWallClockToUtcIso(
  date: string,
  time: string,
): string | null {
  const matchDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const matchTime = /^(\d{2}):(\d{2})$/.exec(time);
  if (!matchDate || !matchTime) return null;

  const year = Number(matchDate[1]);
  const month = Number(matchDate[2]);
  const day = Number(matchDate[3]);
  const hour = Number(matchTime[1]);
  const minute = Number(matchTime[2]);
  if (hour > 23 || minute > 59) return null;

  const local = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute
  ) {
    return null;
  }
  return local.toISOString();
}

/** UTC instant → local date and time fields for form inputs. */
export function utcIsoToLocalFields(
  iso: string,
): { date: string; time: string } | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  return {
    date: todayLocal(instant),
    time: nowTimeLocal(instant),
  };
}

/** Format a UTC instant in the runtime's local timezone. */
export function formatUtcAsLocal(
  iso: string,
  opts?: { seconds?: boolean },
): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;
  // Build date + time separately so locales can't drop the clock portion.
  const datePart = instant.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = instant.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(opts?.seconds ? { second: "2-digit" as const } : {}),
  });
  return `${datePart}, ${timePart}`;
}

/**
 * Parse an absolute instant. Strings without a zone are UTC, so the server
 * never treats them as its own local time.
 */
export function parseUtcInstant(value: string): Date {
  const trimmed = value.trim();
  if (!trimmed) return new Date(NaN);
  const hasZone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(trimmed);
  const normalized = hasZone ? trimmed : `${trimmed.replace(" ", "T")}Z`;
  return new Date(normalized);
}

/** Serialize a stored instant as UTC ISO, independent of server timezone. */
export function toUtcIso(
  value: Date | string | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toISOString();
}
