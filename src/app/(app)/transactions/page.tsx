import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AddTransactionButton } from "@/components/add-modals";
import { deleteTransaction, listCategories, listTransactions } from "@/lib/actions";
import { formatINR } from "@/lib/money";
import {
  currentYearMonth,
  formatYearMonthLabel,
  shiftYearMonth,
} from "@/lib/months";
import { requireUser } from "@/lib/session";

const PAGE_SIZE = 20;

function buildTxHref(args: {
  month: string;
  type?: string;
  category?: string;
  page?: number;
}) {
  const q = new URLSearchParams();
  q.set("month", args.month);
  if (args.type && args.type !== "all") q.set("type", args.type);
  if (args.category) q.set("category", args.category);
  if (args.page && args.page > 1) q.set("page", String(args.page));
  return `/transactions?${q.toString()}`;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    type?: string;
    category?: string;
    page?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentYearMonth();
  const typeFilter =
    params.type === "income" || params.type === "expense" ? params.type : "all";
  const categoryId =
    params.category && /^[0-9a-f-]{36}$/i.test(params.category)
      ? params.category
      : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const cats = await listCategories(user.id);
  const { rows, total, totalPages } = await listTransactions(user.id, month, {
    type: typeFilter,
    categoryId,
    page,
    pageSize: PAGE_SIZE,
  });

  const prev = shiftYearMonth(month, -1);
  const next = shiftYearMonth(month, 1);
  const categories = cats.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
  }));
  const categoryOptions =
    typeFilter === "all"
      ? cats
      : cats.filter((c) => c.kind === typeFilter);

  const filterBase = { month, type: typeFilter, category: categoryId };

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Transactions</h2>
          <p className="muted page-sub">
            Income and expenses for the month. Works offline.
          </p>
        </div>
        <div className="dash-actions">
          <div className="month-switcher" role="group" aria-label="Month">
            <Link
              className="btn btn-ghost btn-xs"
              href={buildTxHref({ ...filterBase, month: prev })}
              aria-label={`Previous month, ${formatYearMonthLabel(prev)}`}
            >
              ←
            </Link>
            <span className="month-label" aria-current="date">
              {formatYearMonthLabel(month)}
            </span>
            <Link
              className="btn btn-ghost btn-xs"
              href={buildTxHref({ ...filterBase, month: next })}
              aria-label={`Next month, ${formatYearMonthLabel(next)}`}
            >
              →
            </Link>
          </div>
          <AddTransactionButton
            categories={categories}
            defaultDate={`${month}-01`}
          />
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>This month</h2>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            {total} {total === 1 ? "entry" : "entries"}
          </span>
        </div>

        <div className="tx-filters" role="toolbar" aria-label="Filters">
          <div className="filter-pills" role="group" aria-label="Type">
            {(
              [
                ["all", "All"],
                ["income", "Income"],
                ["expense", "Expense"],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={buildTxHref({
                  month,
                  type: value,
                  category: undefined,
                })}
                className={
                  typeFilter === value ? "filter-pill active" : "filter-pill"
                }
                aria-current={typeFilter === value ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="filter-pills wrap" role="group" aria-label="Category">
          <Link
            href={buildTxHref({ month, type: typeFilter })}
            className={!categoryId ? "filter-pill active" : "filter-pill"}
          >
            All categories
          </Link>
          {categoryOptions.map((c) => (
            <Link
              key={c.id}
              href={buildTxHref({
                month,
                type: typeFilter,
                category: c.id,
              })}
              className={
                categoryId === c.id ? "filter-pill active" : "filter-pill"
              }
            >
              {c.name}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            No transactions match these filters. Tap{" "}
            <strong>+ Add transaction</strong> to create one.
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th className="num">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const when = row.occurredAt
                      ? new Date(row.occurredAt)
                      : new Date(`${row.date}T12:00:00`);
                    const whenLabel = Number.isNaN(when.getTime())
                      ? row.date
                      : when.toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                    return (
                      <tr key={row.id}>
                        <td className="nowrap">{whenLabel}</td>
                        <td>
                          <div className="tx-main">
                            {row.description?.trim()
                              ? row.description
                              : "—"}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${row.type}`}>{row.type}</span>{" "}
                          {row.categoryName}
                        </td>
                        <td
                          className={`num ${row.type === "income" ? "pos" : ""}`}
                        >
                          {row.type === "income" ? "+" : "−"}
                          {formatINR(row.amount)}
                        </td>
                        <td>
                          <ActionForm
                            action={deleteTransaction}
                            successMessage="Transaction deleted"
                            errorMessage="Could not delete"
                            confirmMessage="Delete this transaction?"
                          >
                            <input type="hidden" name="id" value={row.id} />
                            <button
                              className="btn btn-danger btn-xs"
                              type="submit"
                            >
                              Del
                            </button>
                          </ActionForm>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="pagination" aria-label="Pagination">
                {page > 1 ? (
                  <Link
                    className="btn btn-ghost btn-xs"
                    href={buildTxHref({ ...filterBase, page: page - 1 })}
                  >
                    ← Prev
                  </Link>
                ) : (
                  <span className="btn btn-ghost btn-xs" aria-disabled>
                    ← Prev
                  </span>
                )}
                <span className="muted">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    className="btn btn-ghost btn-xs"
                    href={buildTxHref({ ...filterBase, page: page + 1 })}
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="btn btn-ghost btn-xs" aria-disabled>
                    Next →
                  </span>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
