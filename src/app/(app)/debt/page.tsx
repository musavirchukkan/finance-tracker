import { format } from "date-fns";
import { ActionForm } from "@/components/action-form";
import { EditDebtGoalButton } from "@/components/add-modals";
import { DebtReductionChart } from "@/components/charts";
import {
  AddDebtAccountButton,
  AddDebtPaymentButton,
} from "@/components/debt-forms";
import {
  deleteDebtAccount,
  deleteDebtPayment,
  getDebtDashboard,
  toggleDebtPaymentPaid,
} from "@/lib/actions";
import {
  buildPayoffCurve,
  defaultGoalDate,
  monthsBetween,
} from "@/lib/debt-projection";
import { formatINR } from "@/lib/money";
import { currentYearMonth } from "@/lib/months";
import { requireUser } from "@/lib/session";

function IconBank() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 10h18L12 3 3 10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M4 18h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7l5 5 4-3 7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 16h6v-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHourglass() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 3h12M6 21h12M8 3c0 5 4 6 4 9s-4 4-4 9M16 3c0 5-4 6-4 9s4 4 4 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function DebtPage() {
  const user = await requireUser();
  const data = await getDebtDashboard(user.id);
  const goal = data.settings?.goalPayoffDate ?? defaultGoalDate(19);
  const baselineMonth = currentYearMonth();

  const curve = buildPayoffCurve({
    totalStartingDebt: data.totals.starting,
    goalPayoffDate: goal,
    baselineMonth,
    paymentsByMonth: data.paymentsByMonth,
  });

  const accountOptions = data.accounts.map((a) => ({ id: a.id, name: a.name }));
  const activeAccounts = data.accounts.filter((a) => a.pending > 0);
  const paidPct =
    data.totals.starting > 0
      ? Math.round((data.totals.paid / data.totals.starting) * 1000) / 10
      : 0;
  const monthsLeft = Math.max(
    0,
    monthsBetween(baselineMonth, goal.slice(0, 7)),
  );

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Debt</h2>
          <p className="muted page-sub">
            Track balances, log payments, and stay on the path to zero.
          </p>
        </div>
        <div className="dash-actions">
          <AddDebtAccountButton />
        </div>
      </div>

      <div className="insight-grid">
        <article className="insight-card">
          <div className="insight-card-top">
            <p className="insight-label">Starting total debt</p>
            <span className="insight-icon blue">
              <IconBank />
            </span>
          </div>
          <p className="insight-value">{formatINR(data.totals.starting)}</p>
          <div className="insight-foot">
            <span>Original principal</span>
            <strong>
              {data.accounts.length}{" "}
              {data.accounts.length === 1 ? "account" : "accounts"}
              {activeAccounts.length > 0
                ? ` · ${activeAccounts.length} active`
                : ""}
            </strong>
          </div>
        </article>

        <article className="insight-card">
          <div className="insight-card-top">
            <p className="insight-label">Paid down</p>
            <span className="insight-icon green">
              <IconDown />
            </span>
          </div>
          <div className="insight-value-row">
            <p className="insight-value green">{formatINR(data.totals.paid)}</p>
            <span className="insight-badge">{paidPct}% eliminated</span>
          </div>
          <div
            className="insight-progress"
            role="progressbar"
            aria-valuenow={paidPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${paidPct}% of debt paid`}
          >
            <span style={{ width: `${Math.min(100, Math.max(0, paidPct))}%` }} />
          </div>
        </article>

        <article className="insight-card">
          <div className="insight-card-top">
            <p className="insight-label">Remaining balance</p>
            <span className="insight-icon orange">
              <IconHourglass />
            </span>
          </div>
          <p className="insight-value">{formatINR(data.totals.pending)}</p>
          <p className="insight-sub">
            Target {format(new Date(goal), "MMM yyyy")}
          </p>
          <div className="insight-foot">
            <span>Target closure</span>
            <strong>
              {monthsLeft === 0
                ? "Goal month"
                : `${monthsLeft} month${monthsLeft === 1 ? "" : "s"} to go`}
            </strong>
          </div>
        </article>
      </div>

      <div className="split-board">
        <div className="split-col">
          <section className="panel">
            <div className="panel-head">
              <h2>Debt accounts</h2>
            </div>

            {data.accounts.length === 0 ? (
              <div className="empty">
                No debt accounts yet. Tap <strong>+ Add debt</strong> to create
                one.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Type</th>
                      <th className="num">Starting</th>
                      <th className="num">Paid</th>
                      <th className="num">Pending</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map((a) => (
                      <tr key={a.id}>
                        <td className="tx-main">{a.name}</td>
                        <td>{a.type}</td>
                        <td className="num">
                          {formatINR(a.startingBalanceNum)}
                        </td>
                        <td className="num">{formatINR(a.totalPaid)}</td>
                        <td className="num">{formatINR(a.pending)}</td>
                        <td>{a.status}</td>
                        <td>
                          <ActionForm
                            action={deleteDebtAccount}
                            successMessage="Account deleted"
                            errorMessage="Could not delete account"
                            confirmMessage={`Delete “${a.name}”?`}
                          >
                            <input type="hidden" name="id" value={a.id} />
                            <button
                              className="btn btn-danger btn-xs"
                              type="submit"
                            >
                              Del
                            </button>
                          </ActionForm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Total</td>
                      <td className="num">{formatINR(data.totals.starting)}</td>
                      <td className="num">{formatINR(data.totals.paid)}</td>
                      <td className="num">{formatINR(data.totals.pending)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Payment log</h2>
              <AddDebtPaymentButton accounts={accountOptions} />
            </div>

            {data.payments.length === 0 ? (
              <div className="empty">No payments logged yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Due</th>
                      <th>Account</th>
                      <th>Type</th>
                      <th className="num">Amount</th>
                      <th>Paid?</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="nowrap">{p.dueDate}</td>
                        <td>{p.accountName}</td>
                        <td>{p.paymentType}</td>
                        <td className="num">{formatINR(p.amount)}</td>
                        <td>
                          <ActionForm
                            action={toggleDebtPaymentPaid}
                            successMessage={
                              p.isPaid ? "Marked unpaid" : "Marked paid"
                            }
                            errorMessage="Could not update payment"
                          >
                            <input type="hidden" name="id" value={p.id} />
                            <input
                              type="hidden"
                              name="isPaid"
                              value={String(p.isPaid)}
                            />
                            <button
                              className="btn btn-ghost btn-xs"
                              type="submit"
                              aria-pressed={p.isPaid}
                            >
                              {p.isPaid ? "Paid" : "Unpaid"}
                            </button>
                          </ActionForm>
                        </td>
                        <td>
                          <ActionForm
                            action={deleteDebtPayment}
                            successMessage="Payment deleted"
                            errorMessage="Could not delete payment"
                            confirmMessage="Delete this payment?"
                          >
                            <input type="hidden" name="id" value={p.id} />
                            <button
                              className="btn btn-danger btn-xs"
                              type="submit"
                            >
                              Del
                            </button>
                          </ActionForm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="split-col">
          <section className="panel">
            <h2>Debt reduction</h2>
            <p className="muted page-sub" style={{ marginBottom: "1rem" }}>
              Projected path to ₹0 by {format(new Date(goal), "MMM yyyy")} vs
              actual remaining.
            </p>
            <DebtReductionChart points={curve} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Payoff curve</h2>
              <EditDebtGoalButton goal={goal} label="Edit goal" />
            </div>
            <p className="muted page-sub" style={{ marginBottom: "1rem" }}>
              Target zero by {format(new Date(goal), "MMM d, yyyy")} ·{" "}
              {monthsLeft === 0
                ? "goal month"
                : `${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left`}
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Projected</th>
                    <th className="num">Actual left</th>
                  </tr>
                </thead>
                <tbody>
                  {curve.map((point) => (
                    <tr key={point.month + point.label}>
                      <td>{point.label}</td>
                      <td className="num">{formatINR(point.projected)}</td>
                      <td className="num">
                        {point.actual == null ? "—" : formatINR(point.actual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
