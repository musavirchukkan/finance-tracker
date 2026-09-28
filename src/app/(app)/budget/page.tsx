import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import {
  ActualDonut,
  BudgetVsActualBars,
  CashflowBars,
  IncomeDonut,
} from "@/components/charts";
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
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentYearMonth();

  const { rows, totals, cashflow } = await getBudgetSummary(user.id, month);
  const prev = shiftYearMonth(month, -1);
  const next = shiftYearMonth(month, 1);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Monthly Budget</h2>
          <p className="muted page-sub">
            Income in, spending out, and budget vs actual.
          </p>
        </div>
        <div className="month-switcher">
          <Link className="btn btn-ghost" href={`/budget?month=${prev}`}>
            ←
          </Link>
          <span className="month-label">{formatYearMonthLabel(month)}</span>
          <Link className="btn btn-ghost" href={`/budget?month=${next}`}>
            →
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card income">
          <span>Income</span>
          <strong>{formatINR(cashflow.income)}</strong>
        </div>
        <div className="stat-card expense">
          <span>Spent</span>
          <strong>{formatINR(cashflow.expense)}</strong>
        </div>
        <div className={`stat-card ${cashflow.remaining >= 0 ? "left" : "over"}`}>
          <span>Remaining</span>
          <strong>{formatINR(cashflow.remaining)}</strong>
        </div>
      </div>

      <div className="chart-grid">
        <section className="panel">
          <h2>Cashflow</h2>
          <CashflowBars income={cashflow.income} expense={cashflow.expense} />
        </section>
        <section className="panel">
          <h2>Income sources</h2>
          <IncomeDonut rows={cashflow.incomeBreakdown} />
        </section>
        <section className="panel">
          <h2>Spend by category</h2>
          <ActualDonut rows={rows} />
        </section>
        <section className="panel">
          <h2>Budget vs. Actual</h2>
          <BudgetVsActualBars rows={rows} />
        </section>
      </div>

      <section className="panel">
        <h2>Expense budget by category</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Budget</th>
                <th className="num">Actual</th>
                <th className="num">Left</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.categoryId}>
                  <td>{row.category}</td>
                  <td className="num">
                    <ActionForm
                      action={upsertBudgetAmount}
                      successMessage={`${row.category} budget saved`}
                      errorMessage="Could not save budget"
                      className="inline-budget"
                    >
                      <input type="hidden" name="categoryId" value={row.categoryId} />
                      <input type="hidden" name="yearMonth" value={month} />
                      <input
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        defaultValue={row.budget.toFixed(2)}
                        className="budget-input"
                      />
                      <button className="btn btn-ghost btn-xs" type="submit">
                        Save
                      </button>
                    </ActionForm>
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
