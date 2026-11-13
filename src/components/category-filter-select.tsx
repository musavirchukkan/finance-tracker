"use client";

import { useRouter } from "next/navigation";
import {
  buildTransactionsHref,
  type PaidFromFilter,
} from "@/lib/transaction-filters";

type CategoryOption = {
  id: string;
  name: string;
};

type CategoryFilterSelectProps = {
  month: string;
  type: string;
  categoryId?: string;
  paidFrom?: PaidFromFilter;
  options: CategoryOption[];
};

export function CategoryFilterSelect({
  month,
  type,
  categoryId,
  paidFrom,
  options,
}: CategoryFilterSelectProps) {
  const router = useRouter();

  return (
    <label className="filter-select-wrap">
      <span className="sr-only">Category</span>
      <select
        className="filter-select"
        value={categoryId ?? ""}
        aria-label="Category"
        onChange={(e) => {
          const next = e.target.value || undefined;
          router.push(
            buildTransactionsHref({
              month,
              type,
              category: next,
              paidFrom,
            }),
          );
        }}
      >
        <option value="">All categories</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
