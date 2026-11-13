"use client";

import { useRouter } from "next/navigation";
import {
  buildTransactionsHref,
  encodePaidFromParam,
  type PaidFromFilter,
} from "@/lib/transaction-filters";

type Option = { id: string; label: string };

type PaidFromFilterSelectProps = {
  month: string;
  type: string;
  categoryId?: string;
  paidFrom?: PaidFromFilter;
  banks: Option[];
  cards: Option[];
};

export function PaidFromFilterSelect({
  month,
  type,
  categoryId,
  paidFrom,
  banks,
  cards,
}: PaidFromFilterSelectProps) {
  const router = useRouter();
  const value = paidFrom ? encodePaidFromParam(paidFrom) : "";

  return (
    <label className="filter-select-wrap">
      <span className="sr-only">Paid from</span>
      <select
        className="filter-select"
        value={value}
        aria-label="Paid from"
        onChange={(e) => {
          const next = e.target.value || undefined;
          router.push(
            buildTransactionsHref({
              month,
              type,
              category: categoryId,
              paidFrom: next,
            }),
          );
        }}
      >
        <option value="">All accounts</option>
        {banks.length > 0 ? (
          <optgroup label="Banks">
            {banks.map((b) => (
              <option key={b.id} value={encodePaidFromParam({ kind: "bank", id: b.id })}>
                {b.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        {cards.length > 0 ? (
          <optgroup label="Cards">
            {cards.map((c) => (
              <option key={c.id} value={encodePaidFromParam({ kind: "card", id: c.id })}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}
