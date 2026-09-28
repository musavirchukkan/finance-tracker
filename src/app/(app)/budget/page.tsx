import Link from "next/link";
import { ActualDonut, BudgetVsActualBars } from "@/components/charts";
import { getBudgetSummary, upsertBudgetAmount } from "@/lib/actions";
import { formatINR } from "@/lib/money";
import {
  currentYearMonth,
  formatYearMonthLabel,
  shiftYearMonth,
} from "@/lib/months";
import { requireUser } from "@/lib/session";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : currentYearMonth();

  const { rows, totals } = await getBudgetSummary(user.id, month);
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
            Monthly Budget
          </h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Compare planned vs actual spending. Actuals come from Transactions.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Link className="btn btn-ghost" href={`/budget?month=${prev}`}>
            ← Prev
          </Link>
          <span style={{ fontWeight: 700, minWidth: 140, textAlign: "center" }}>
            {formatYearMonthLabel(month)}
          </span>
          <Link className="btn btn-ghost" href={`/budget?month=${next}`}>
            Next →
          </Link>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        }}
      >
        <section className="panel">
          <h2>Actual Summary</h2>
          <ActualDonut rows={rows} />
        </section>
        <section className="panel">
          <h2>Budget vs. Actual</h2>
          <BudgetVsActualBars rows={rows} />
        </section>
      </div>

      <section className="panel">
        <h2>Summary by Category</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Budget</th>
                <th className="num">Actual</th>
                <th className="num">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.categoryId}>
                  <td>{row.category}</td>
                  <td className="num">
                    <form
                      action={upsertBudgetAmount}
                      style={{
                        display: "inline-flex",
                        gap: 6,
                        justifyContent: "flex-end",
                        width: "100%",
                      }}
                    >
                      <input type="hidden" name="categoryId" value={row.categoryId} />
                      <input type="hidden" name="yearMonth" value={month} />
                      <input
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={row.budget.toFixed(2)}
                        style={{
                          width: 110,
                          textAlign: "right",
                          border: "1px solid var(--line)",
                          borderRadius: 8,
                          padding: "0.3rem 0.45rem",
                        }}
                      />
                      <button className="btn btn-ghost" type="submit" style={{ padding: "0.3rem 0.55rem" }}>
                        Save
                      </button>
                    </form>
                  </td>
                  <td className="num">{formatINR(row.actual)}</td>
                  <td className={`num ${row.difference < 0 ? "neg" : "pos"}`}>
                    {formatINR(row.difference)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{formatINR(totals.budget)}</td>
                <td className="num">{formatINR(totals.actual)}</td>
                <td className={`num ${totals.difference < 0 ? "neg" : "pos"}`}>
                  {formatINR(totals.difference)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
