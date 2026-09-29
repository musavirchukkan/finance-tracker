import Link from "next/link";
import {
  ActualDonut,
  BudgetVsActualBars,
  CashflowBars,
  CHART_COLORS,
  IncomeDonut,
} from "@/components/charts";
import { BudgetCategoryTable } from "@/components/budget-table";
import { getBudgetSummary } from "@/lib/actions";
import { formatINR } from "@/lib/money";
import {
  currentYearMonth,
  formatYearMonthLabel,
  shiftYearMonth,
} from "@/lib/months";
import { requireUser } from "@/lib/session";

function IconInflow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v12M7 11l5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 20h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSpent() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20V8M7 13l5-5 5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 4h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPiggy() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 11c0-3 2.5-5.5 7-5.5 3.5 0 6 1.5 7 4 1.5.3 2.5 1.5 2.5 3s-1 2.5-2.5 2.8V18H16v-2H9v2H5v-2.7C3.5 14.8 3 13.5 3 12c0-.5.1-1 .3-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="15.5" cy="11" r="0.8" fill="currentColor" />
    </svg>
  );
}

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

  const prev = shiftYearMonth(month, -1);
  const next = shiftYearMonth(month, 1);

  const [summary, prevSummary] = await Promise.all([
    getBudgetSummary(user.id, month),
    getBudgetSummary(user.id, prev),
  ]);
  const { rows, totals, cashflow } = summary;

  const incomeDeltaPct =
    prevSummary.cashflow.income > 0
      ? Math.round(
          ((cashflow.income - prevSummary.cashflow.income) /
            prevSummary.cashflow.income) *
            1000,
        ) / 10
      : cashflow.income > 0
        ? 100
        : 0;

  const topSources = [...cashflow.incomeBreakdown]
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((r) => r.name);
  const primarySource =
    topSources.length === 0 ? "No income yet" : topSources.join(" & ");

  const budgetTotal = totals.budget;
  const utilizedPct =
    budgetTotal > 0
      ? Math.round((totals.actual / budgetTotal) * 1000) / 10
      : cashflow.expense > 0
        ? 100
        : 0;

  const day = new Date().getDate();
  const daysInMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();
  const expectedPace =
    budgetTotal > 0 ? (day / daysInMonth) * budgetTotal : 0;
  const pacing =
    budgetTotal <= 0
      ? cashflow.expense <= 0
        ? { label: "No budget set", tone: "neutral" as const }
        : { label: "Unbudgeted spend", tone: "warn" as const }
      : totals.actual > budgetTotal
        ? { label: "Over budget", tone: "bad" as const }
        : totals.actual > expectedPace * 1.1
          ? { label: "Ahead of pace", tone: "warn" as const }
          : { label: "On track", tone: "good" as const };

  const remaining = cashflow.remaining;
  const surplus =
    remaining > 0
      ? {
          line: "Surplus buffer intact",
          foot: "Safe to allocate",
          tone: "good" as const,
        }
      : remaining === 0
        ? {
            line: "Fully allocated",
            foot: "Balanced month",
            tone: "neutral" as const,
          }
        : {
            line: "Spending exceeds income",
            foot: "Tighten categories",
            tone: "bad" as const,
          };

  const prevLabel = formatYearMonthLabel(prev).split(" ")[0] ?? "last month";
  const unsetBudgets = rows.filter((r) => r.budget <= 0).length;
  const overCategories = rows.filter((r) => r.difference < 0).length;
  const underCategories = rows.filter(
    (r) => r.budget > 0 && r.difference > 0,
  ).length;

  const spendRows = [...rows]
    .filter((r) => r.actual > 0)
    .sort((a, b) => b.actual - a.actual);
  const spendTotal = spendRows.reduce((s, r) => s + r.actual, 0);

  const incomeRows = [...cashflow.incomeBreakdown]
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const incomeTotal = incomeRows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Budget</h2>
          <p className="muted page-sub">
            Income, spending, and category budgets for the month.
          </p>
        </div>
        <div className="month-switcher" role="group" aria-label="Month">
          <Link
            className="btn btn-ghost btn-xs"
            href={`/budget?month=${prev}`}
            aria-label={`Previous month, ${formatYearMonthLabel(prev)}`}
          >
            ←
          </Link>
          <span className="month-label" aria-current="date">
            {formatYearMonthLabel(month)}
          </span>
          <Link
            className="btn btn-ghost btn-xs"
            href={`/budget?month=${next}`}
            aria-label={`Next month, ${formatYearMonthLabel(next)}`}
          >
            →
          </Link>
        </div>
      </div>

      <div className="insight-grid">
        <article className="insight-card">
          <div className="insight-card-top">
            <p className="insight-label">Monthly inflow</p>
            <span className="insight-icon green">
              <IconInflow />
            </span>
          </div>
          <p className="insight-value green">{formatINR(cashflow.income)}</p>
          <p
            className={`insight-sub ${incomeDeltaPct >= 0 ? "pos" : "neg"}`}
          >
            {incomeDeltaPct >= 0 ? "↑" : "↓"}{" "}
            {incomeDeltaPct >= 0 ? "+" : ""}
            {incomeDeltaPct}% vs {prevLabel}
          </p>
          <div className="insight-foot">
            <span>Primary source</span>
            <span className="insight-pill good">{primarySource}</span>
          </div>
        </article>

        <article className="insight-card">
          <div className="insight-card-top">
            <p className="insight-label">Total spent</p>
            <span className="insight-icon orange">
              <IconSpent />
            </span>
          </div>
          <p className="insight-value">{formatINR(cashflow.expense)}</p>
          <p className="insight-sub">
            {budgetTotal > 0
              ? `${utilizedPct}% utilized of budget`
              : "No category budgets set yet"}
          </p>
          <div className="insight-foot">
            <span>Pacing status</span>
            <span className={`insight-pill ${pacing.tone}`}>
              {pacing.tone === "good" ? (
                <span className="insight-pill-dot" aria-hidden />
              ) : null}
              {pacing.label}
            </span>
          </div>
        </article>

        <article className="insight-card">
          <div className="insight-card-top">
            <p className="insight-label">Unallocated cash</p>
            <span className="insight-icon blue">
              <IconPiggy />
            </span>
          </div>
          <p
            className={`insight-value ${remaining >= 0 ? "" : "neg-value"}`}
          >
            {formatINR(remaining)}
          </p>
          <p
            className={`insight-sub ${surplus.tone === "good" ? "pos" : surplus.tone === "bad" ? "neg" : ""}`}
          >
            {surplus.line}
          </p>
          <div className="insight-foot">
            <span>Deployment</span>
            <span className={`insight-pill solid ${surplus.tone}`}>
              {surplus.foot}
            </span>
          </div>
        </article>
      </div>

      {(unsetBudgets > 0 || overCategories > 0) && (
        <div className="budget-alerts">
          {unsetBudgets > 0 ? (
            <p className="budget-alert">
              {unsetBudgets} categor
              {unsetBudgets === 1 ? "y has" : "ies have"} no budget — set
              amounts in the table below.
            </p>
          ) : null}
          {overCategories > 0 ? (
            <p className="budget-alert warn">
              {overCategories} categor
              {overCategories === 1 ? "y is" : "ies are"} over budget this
              month.
            </p>
          ) : null}
        </div>
      )}

      <div className="split-board">
        <div className="split-col">
          <section className="panel">
            <div className="panel-head">
              <h2>Cash flow</h2>
              <span className="chip">{formatYearMonthLabel(month)}</span>
            </div>
            <div className="legend-row">
              <span className="legend-item">
                <span className="chip-dot" style={{ background: "#ff5c00" }} />
                Income
              </span>
              <span className="legend-item">
                <span className="chip-dot" style={{ background: "#a855f7" }} />
                Spent
              </span>
              <span className="legend-item">
                <span className="chip-dot" style={{ background: "#3b82f6" }} />
                Left
              </span>
            </div>
            <CashflowBars income={cashflow.income} expense={cashflow.expense} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Spend by category</h2>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {spendRows.length} categor
                {spendRows.length === 1 ? "y" : "ies"}
              </span>
            </div>
            <div className="category-layout">
              <div style={{ position: "relative" }}>
                <ActualDonut
                  rows={rows}
                  showLegend={false}
                  height={200}
                  inner={58}
                  outer={88}
                />
                <div
                  className="donut-center-label"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <strong>{formatINR(spendTotal)}</strong>
                  <span>Total spent</span>
                </div>
              </div>
              <ul className="category-legend">
                {spendRows.length === 0 ? (
                  <li className="muted">No spending yet</li>
                ) : (
                  spendRows.map((r, i) => {
                    const pct =
                      spendTotal > 0
                        ? Math.round((r.actual / spendTotal) * 100)
                        : 0;
                    const overBudget = r.budget > 0 && r.actual > r.budget;
                    return (
                      <li
                        key={r.categoryId}
                        className={overBudget ? "over-budget" : undefined}
                      >
                        <span className={`name ${overBudget ? "neg" : ""}`}>
                          <span
                            className="chip-dot"
                            style={{
                              background:
                                CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                          {r.category}
                        </span>
                        <span className={`num ${overBudget ? "neg" : ""}`}>
                          {formatINR(r.actual)}
                        </span>
                        <span className={`pct ${overBudget ? "neg" : ""}`}>
                          {pct}%
                        </span>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </section>
        </div>

        <div className="split-col">
          <section className="panel">
            <div className="panel-head">
              <h2>Income sources</h2>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {incomeRows.length} source
                {incomeRows.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="category-layout">
              <div style={{ position: "relative" }}>
                <IncomeDonut
                  rows={cashflow.incomeBreakdown}
                  showLegend={false}
                  height={200}
                  inner={58}
                  outer={88}
                />
                <div
                  className="donut-center-label"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <strong>{formatINR(incomeTotal)}</strong>
                  <span>Total income</span>
                </div>
              </div>
              <ul className="category-legend">
                {incomeRows.length === 0 ? (
                  <li className="muted">No income yet</li>
                ) : (
                  incomeRows.map((r, i) => {
                    const pct =
                      incomeTotal > 0
                        ? Math.round((r.value / incomeTotal) * 100)
                        : 0;
                    return (
                      <li key={r.name}>
                        <span className="name">
                          <span
                            className="chip-dot"
                            style={{
                              background:
                                CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                          {r.name}
                        </span>
                        <span className="num">{formatINR(r.value)}</span>
                        <span className="pct">{pct}%</span>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Budget vs. Actual</h2>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {formatINR(totals.actual)} / {formatINR(totals.budget)}
              </span>
            </div>
            <div className="legend-row">
              <span className="legend-item">
                <span className="chip-dot" style={{ background: "#6366f1" }} />
                Budget
              </span>
              <span className="legend-item">
                <span className="chip-dot" style={{ background: "#ff5c00" }} />
                Actual
              </span>
            </div>
            <BudgetVsActualBars rows={rows} />
            <div className="cashflow-footer">
              <span>
                Budgeted {formatINR(totals.budget)}
              </span>
              <span>
                Spent {formatINR(totals.actual)}
                {budgetTotal > 0 ? (
                  <span className="muted"> · {utilizedPct}%</span>
                ) : null}
              </span>
              <span>
                {overCategories > 0 ? (
                  <span className="neg">{overCategories} over</span>
                ) : (
                  <span className="pos">None over</span>
                )}
                {underCategories > 0 ? (
                  <span className="muted"> · {underCategories} under</span>
                ) : null}
              </span>
            </div>
          </section>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Expense budget by category</h2>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            {formatINR(totals.actual)} / {formatINR(totals.budget)}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="empty">
            No expense categories yet. Add them in Settings.
          </div>
        ) : (
          <BudgetCategoryTable
            rows={rows}
            totals={totals}
            yearMonth={month}
          />
        )}
      </section>
    </div>
  );
}
