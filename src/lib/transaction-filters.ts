/** URL helpers for /transactions filters (paid-from bank or card). */

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type PaidFromFilter =
  | { kind: "bank"; id: string }
  | { kind: "card"; id: string };

export function parsePaidFromParam(
  raw: string | undefined | null,
): PaidFromFilter | undefined {
  if (!raw) return undefined;
  const match = /^(bank|card):([0-9a-f-]{36})$/i.exec(raw.trim());
  if (!match) return undefined;
  const kind = match[1].toLowerCase() as "bank" | "card";
  const id = match[2];
  if (!UUID_RE.test(id)) return undefined;
  return { kind, id };
}

export function encodePaidFromParam(filter: PaidFromFilter): string {
  return `${filter.kind}:${filter.id}`;
}

export function buildTransactionsHref(args: {
  month: string;
  type?: string;
  category?: string;
  paidFrom?: PaidFromFilter | string | null;
  page?: number;
}) {
  const q = new URLSearchParams();
  q.set("month", args.month);
  if (args.type && args.type !== "all") q.set("type", args.type);
  if (args.category) q.set("category", args.category);
  if (args.paidFrom) {
    const encoded =
      typeof args.paidFrom === "string"
        ? args.paidFrom
        : encodePaidFromParam(args.paidFrom);
    if (encoded) q.set("from", encoded);
  }
  if (args.page && args.page > 1) q.set("page", String(args.page));
  return `/transactions?${q.toString()}`;
}
