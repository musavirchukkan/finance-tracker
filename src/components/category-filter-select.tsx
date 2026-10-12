"use client";

import { useRouter } from "next/navigation";

type CategoryOption = {
  id: string;
  name: string;
};

type CategoryFilterSelectProps = {
  month: string;
  type: string;
  categoryId?: string;
  options: CategoryOption[];
};

function buildHref(month: string, type: string, category?: string) {
  const q = new URLSearchParams();
  q.set("month", month);
  if (type && type !== "all") q.set("type", type);
  if (category) q.set("category", category);
  return `/transactions?${q.toString()}`;
}

export function CategoryFilterSelect({
  month,
  type,
  categoryId,
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
          router.push(buildHref(month, type, next));
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
