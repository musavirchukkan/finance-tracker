import Link from "next/link";
import {
  createTransaction,
  deleteTransaction,
  listCategories,
  listTransactions,
  updateTransaction,
} from "@/lib/actions";
import { formatINR, toNumber } from "@/lib/money";
import {
  currentYearMonth,
  formatYearMonthLabel,
  shiftYearMonth,
} from "@/lib/months";
import { requireUser } from "@/lib/session";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; edit?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : currentYearMonth();
  const cats = await listCategories(user.id);
  const rows = await listTransactions(user.id, month);
  const editing = rows.find((r) => r.id === params.edit);
  const prev = shiftYearMonth(month, -1);
  const next = shiftYearMonth(month, 1);

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-fraunces), Georgia, serif",
              fontSize: "1.5rem",
            }}
          >
            Transactions
          </h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Log expenses and pick a category. Totals roll up into the Budget sheet.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Link className="btn btn-ghost" href={`/transactions?month=${prev}`}>
            ← Prev
          </Link>
          <span style={{ fontWeight: 700, minWidth: 140, textAlign: "center" }}>
            {formatYearMonthLabel(month)}
          </span>
          <Link className="btn btn-ghost" href={`/transactions?month=${next}`}>
            Next →
          </Link>
        </div>
      </div>

      <section className="panel">
        <h2>{editing ? "Edit transaction" : "Add transaction"}</h2>
        <form
          action={editing ? updateTransaction : createTransaction}
          className="form-row"
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <div className="field">
            <label htmlFor="date">Date</label>
            <input
              id="date"
              name="date"
              type="date"
              required
              defaultValue={editing?.date ?? `${month}-01`}
            />
          </div>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label htmlFor="description">Description</label>
            <input
              id="description"
              name="description"
              required
              defaultValue={editing?.description ?? ""}
              placeholder="Groceries"
            />
          </div>
          <div className="field">
            <label htmlFor="categoryId">Category</label>
            <select
              id="categoryId"
              name="categoryId"
              required
              defaultValue={editing?.categoryId ?? cats[0]?.id}
            >
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="amount">Amount (₹)</label>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={editing ? toNumber(editing.amount).toFixed(2) : ""}
            />
          </div>
          <button className="btn btn-primary" type="submit">
            {editing ? "Update" : "Add"}
          </button>
          {editing ? (
            <Link className="btn btn-ghost" href={`/transactions?month=${month}`}>
              Cancel
            </Link>
          ) : null}
        </form>
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
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.description}</td>
                    <td>{row.categoryName}</td>
                    <td className="num">{formatINR(row.amount)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link
                        className="btn btn-ghost"
                        href={`/transactions?month=${month}&edit=${row.id}`}
                        style={{ padding: "0.3rem 0.55rem", marginRight: 6 }}
                      >
                        Edit
                      </Link>
                      <form action={deleteTransaction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={row.id} />
                        <button
                          className="btn btn-danger"
                          type="submit"
                          style={{ padding: "0.3rem 0.55rem" }}
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
