import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { TransactionForm } from "@/components/transaction-form";
import { deleteTransaction, listCategories, listTransactions } from "@/lib/actions";
import { formatINR } from "@/lib/money";
import {
  currentYearMonth,
  formatYearMonthLabel,
  shiftYearMonth,
} from "@/lib/months";
import { requireUser } from "@/lib/session";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentYearMonth();
  const cats = await listCategories(user.id);
  const rows = await listTransactions(user.id, month);
  const prev = shiftYearMonth(month, -1);
  const next = shiftYearMonth(month, 1);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Transactions</h2>
          <p className="muted page-sub">
            Add income or expenses. Works offline — syncs when you reconnect.
          </p>
        </div>
        <div className="month-switcher">
          <Link className="btn btn-ghost" href={`/transactions?month=${prev}`}>
            ←
          </Link>
          <span className="month-label">{formatYearMonthLabel(month)}</span>
          <Link className="btn btn-ghost" href={`/transactions?month=${next}`}>
            →
          </Link>
        </div>
      </div>

      <section className="panel">
        <h2>Add</h2>
        <TransactionForm
          categories={cats.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
          }))}
          defaultDate={`${month}-01`}
        />
      </section>

      <section className="panel">
        <h2>This month</h2>
        {rows.length === 0 ? (
          <div className="empty">No transactions for {formatYearMonthLabel(month)}.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Details</th>
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
                      <div className="tx-main">{row.description}</div>
                      <div className="muted tx-meta">
                        <span className={`badge ${row.type}`}>{row.type}</span>{" "}
                        {row.categoryName}
                      </div>
                    </td>
                    <td className={`num ${row.type === "income" ? "pos" : ""}`}>
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
                        <button className="btn btn-danger btn-xs" type="submit">
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
        )}
      </section>
    </div>
  );
}
