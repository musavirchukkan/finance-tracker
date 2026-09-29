import Link from "next/link";
import {
  ActualDonut,
  CHART_COLORS,
  MiniBars,
  Sparkline,
  WeeklyCashflowBars,
} from "@/components/charts";
import {
  getBudgetSummary,
  getDebtDashboard,
  listSavingsGoals,
  listTransactions,
} from "@/lib/actions";
import { formatINR, toNumber } from "@/lib/money";
import {
  currentYearMonth,
  formatYearMonthLabel,
  monthDateBounds,
  shiftYearMonth,
} from "@/lib/months";
import { requireUser } from "@/lib/session";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function weekBuckets(yearMonth: string) {
  const { start, end } = monthDateBounds(yearMonth);
  const startDay = Number(start.slice(8, 10));
  const endDay = Number(end.slice(8, 10));
  const weeks: { label: string; startDay: number; endDay: number }[] = [];
  let d = startDay;
  let i = 1;
  while (d <= endDay) {
    const weekEnd = Math.min(d + 6, endDay);
    weeks.push({
      label: `${i} week`,
      startDay: d,
      endDay: weekEnd,
    });
    d = weekEnd + 1;
    i += 1;
  }
  return weeks;
}

function SegmentedBar({ pct }: { pct: number }) {
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / 5);
  return (
    <div className="seg-bar" aria-hidden>
      {Array.from({ length: 20 }, (_, i) => (
        <i key={i} className={i < filled ? "on" : undefined} />
      ))}
    </div>
  );
}

export default async function OverviewPage({
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

  const [{ rows, cashflow }, { rows: txs }, debt, goals] = await Promise.all([
    getBudgetSummary(user.id, month),
    listTransactions(user.id, month),
    getDebtDashboard(user.id),
    listSavingsGoals(user.id),
  ]);

  const prev = shiftYearMonth(month, -1);
  const next = shiftYearMonth(month, 1);
  const firstName = user.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();

  const weeks = weekBuckets(month).map((w) => {
    let income = 0;
    let expense = 0;
    for (const t of txs) {
      const day = Number(String(t.date).slice(8, 10));
      if (day < w.startDay || day > w.endDay) continue;
      const amt = toNumber(t.amount);
      if (t.type === "income") income += amt;
      else expense += amt;
    }
    return { label: w.label, income, expense };
  });

  const savingRate =
    cashflow.income > 0
      ? Math.round((cashflow.remaining / cashflow.income) * 1000) / 10
      : 0;

  const spendTotal = cashflow.expense;
  const catRows = rows
    .filter((r) => r.actual > 0)
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 5);

  const recent = txs.slice(0, 6);

  const sparkIncome = weeks.map((w) => w.income);
  const sparkExpense = weeks.map((w) => w.expense);
  const sparkBalance = weeks.map((w) => w.income - w.expense);
  const barValues =
    sparkIncome.length >= 4
      ? sparkIncome
      : [0.3, 0.5, 0.45, 0.7, 0.55, 0.85, savingRate / 100 || 0.4];

  const accountChips = debt.accounts.slice(0, 3);
  const chipColors = ["#ff5c00", "#3b82f6", "#f59e0b", "#a855f7"];
  const overviewGoals = goals.slice(0, 2);
  const paidPct =
    debt.totals.starting > 0
      ? Math.round((debt.totals.paid / debt.totals.starting) * 100)
      : 0;
  const hasDebt = debt.totals.starting > 0;

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="greeting-title">
            {greetingForHour(hour)}, {firstName}
          </h2>
          <p className="muted page-sub">
            Here&apos;s your money across all accounts ·{" "}
            {formatYearMonthLabel(month)}
          </p>
        </div>
        <div className="dash-actions">
          <div className="month-switcher" role="group" aria-label="Month">
            <Link
              className="btn btn-ghost btn-xs"
              href={`/overview?month=${prev}`}
              aria-label={`Previous month, ${formatYearMonthLabel(prev)}`}
            >
              ←
            </Link>
            <span className="month-label" aria-current="date">
              {formatYearMonthLabel(month)}
            </span>
            <Link
              className="btn btn-ghost btn-xs"
              href={`/overview?month=${next}`}
              aria-label={`Next month, ${formatYearMonthLabel(next)}`}
            >
              →
            </Link>
          </div>
          <Link className="btn btn-ghost btn-xs" href="/debt">
            Manage debt
          </Link>
        </div>
      </div>

      <div className="account-chips">
        <Link href="/debt" className="chip chip-add">
          + Add debt
        </Link>
        {accountChips.length === 0 ? (
          <span className="chip">
            <span className="chip-dot" style={{ background: "#ff5c00" }} />
            All accounts
          </span>
        ) : (
          accountChips.map((a, i) => (
            <span key={a.id} className="chip">
              <span
                className="chip-dot"
                style={{ background: chipColors[i % chipColors.length] }}
              />
              {a.name}
            </span>
          ))
        )}
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <label>Total remaining</label>
          <p className="kpi-value">{formatINR(cashflow.remaining)}</p>
          <span
            className={`kpi-delta ${cashflow.remaining >= 0 ? "up" : "down"}`}
          >
            {cashflow.remaining >= 0 ? "+" : ""}
            {formatINR(cashflow.remaining)} this month
          </span>
          <div className="kpi-chart">
            <Sparkline values={sparkBalance.length ? sparkBalance : [0, 1]} color="#ff5c00" />
          </div>
        </div>
        <div className="kpi-card">
          <label>Monthly income</label>
          <p className="kpi-value">{formatINR(cashflow.income)}</p>
          <span className="kpi-delta up">Income</span>
          <div className="kpi-chart">
            <Sparkline
              values={sparkIncome.length ? sparkIncome : [0, 1]}
              color="#ff5c00"
            />
          </div>
        </div>
        <div className="kpi-card">
          <label>Monthly expenses</label>
          <p className="kpi-value">{formatINR(cashflow.expense)}</p>
          <span className="kpi-delta down">Spent</span>
          <div className="kpi-chart">
            <Sparkline
              values={sparkExpense.length ? sparkExpense : [0, 1]}
              color="#a855f7"
            />
          </div>
        </div>
        <div className="kpi-card">
          <label>Saving rate</label>
          <p className="kpi-value">{savingRate}%</p>
          <span className={`kpi-delta ${savingRate >= 0 ? "up" : "down"}`}>
            of income left
          </span>
          <div className="kpi-chart">
            <MiniBars values={barValues} />
          </div>
        </div>
      </div>

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
                Expenses
              </span>
            </div>
            <WeeklyCashflowBars weeks={weeks} />
            <div className="cashflow-footer">
              <span>
                <span className="bar" style={{ background: "#ff5c00" }} />
                Income {formatINR(cashflow.income)}
              </span>
              <span>
                <span className="bar" style={{ background: "#a855f7" }} />
                Expense {formatINR(cashflow.expense)}
              </span>
              <span>
                Net{" "}
                <span className={cashflow.remaining >= 0 ? "pos" : "neg"}>
                  {cashflow.remaining >= 0 ? "+" : ""}
                  {formatINR(cashflow.remaining)}
                </span>
              </span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Recent transactions</h2>
              <Link className="linkish" href={`/transactions?month=${month}`}>
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="empty">No transactions this month.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Merchant</th>
                      <th>Category</th>
                      <th>Date</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((t) => {
                      const amt = toNumber(t.amount);
                      const isIncome = t.type === "income";
                      return (
                        <tr key={t.id}>
                          <td>
                            <div className="tx-main">{t.description}</div>
                          </td>
                          <td>
                            <span
                              className={`badge ${isIncome ? "income" : "expense"}`}
                            >
                              {t.categoryName}
                            </span>
                          </td>
                          <td className="nowrap muted">{t.date}</td>
                          <td
                            className={`num ${isIncome ? "amount-pos" : "amount-neg"}`}
                          >
                            {isIncome ? "+" : "−"}
                            {formatINR(amt)}
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

        <div className="split-col">
          <section className="panel">
            <div className="panel-head">
              <h2>Spending by category</h2>
              <Link className="linkish" href="/budget">
                →
              </Link>
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
                {catRows.length === 0 ? (
                  <li className="muted">No spending yet</li>
                ) : (
                  catRows.map((r, i) => {
                    const pct =
                      spendTotal > 0
                        ? Math.round((r.actual / spendTotal) * 100)
                        : 0;
                    return (
                      <li key={r.categoryId}>
                        <span className="name">
                          <span
                            className="chip-dot"
                            style={{
                              background:
                                CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                          {r.category}
                        </span>
                        <span className="num">{formatINR(r.actual)}</span>
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
              <h2>Saving goals</h2>
              <Link className="linkish" href="/goals">
                →
              </Link>
            </div>
            {!hasDebt && overviewGoals.length === 0 ? (
              <div className="empty">
                No goals yet.{" "}
                <Link className="linkish" href="/goals">
                  Create one
                </Link>
              </div>
            ) : (
              <div className="goal-list">
                {hasDebt ? (
                  <div>
                    <div className="goal-row-head">
                      <strong>Debt payoff</strong>
                      <span className="muted">
                        {formatINR(debt.totals.paid)} /{" "}
                        {formatINR(debt.totals.starting)}
                      </span>
                    </div>
                    <SegmentedBar pct={paidPct} />
                    <p className="goal-meta">
                      {paidPct}% paid · Remaining{" "}
                      {formatINR(debt.totals.pending)}
                    </p>
                  </div>
                ) : null}
                {overviewGoals.map((g) => (
                  <div key={g.id}>
                    <div className="goal-row-head">
                      <strong>{g.name}</strong>
                      <span className="muted">
                        {formatINR(g.currentAmount)} /{" "}
                        {formatINR(g.targetAmount)}
                      </span>
                    </div>
                    <SegmentedBar pct={g.pct} />
                    <p className="goal-meta">
                      {g.pct}% ·{" "}
                      {g.remaining > 0
                        ? `${formatINR(g.remaining)} left`
                        : "Target reached"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
