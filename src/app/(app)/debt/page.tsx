import { format } from "date-fns";
import { ActionForm } from "@/components/action-form";
import { DebtReductionChart } from "@/components/charts";
import {
  createDebtAccount,
  createDebtPayment,
  deleteDebtAccount,
  deleteDebtPayment,
  getDebtDashboard,
  toggleDebtPaymentPaid,
  updateDebtGoal,
} from "@/lib/actions";
import { buildPayoffCurve, defaultGoalDate } from "@/lib/debt-projection";
import { formatINR } from "@/lib/money";
import { currentYearMonth } from "@/lib/months";
import { requireUser } from "@/lib/session";

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

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Debt</h2>
          <p className="muted page-sub">
            Accounts, payments, and your path to zero.
          </p>
        </div>
        <ActionForm
          action={updateDebtGoal}
          successMessage="Debt payoff goal saved"
          errorMessage="Could not save goal"
          className="form-row goal-form"
        >
          <div className="field">
            <label htmlFor="goalPayoffDate">Goal payoff</label>
            <input
              id="goalPayoffDate"
              name="goalPayoffDate"
              type="date"
              required
              defaultValue={goal}
            />
          </div>
          <button className="btn btn-primary" type="submit">
            Save goal
          </button>
        </ActionForm>
      </div>

      <div className="stat-grid debt-stats">
        <div className="stat-card">
          <span>Starting</span>
          <strong>{formatINR(data.totals.starting)}</strong>
        </div>
        <div className="stat-card income">
          <span>Paid down</span>
          <strong>{formatINR(data.totals.paid)}</strong>
        </div>
        <div className={`stat-card ${data.totals.pending > 0 ? "expense" : "left"}`}>
          <span>Remaining</span>
          <strong>{formatINR(data.totals.pending)}</strong>
        </div>
      </div>

      <div className="chart-grid">
        <section className="panel">
          <h2>Accounts</h2>
          <ActionForm
            action={createDebtAccount}
            successMessage="Debt account added"
            errorMessage="Could not add account"
            className="form-row"
            style={{ marginBottom: "1rem" }}
            resetOnSuccess
          >
            <div className="field">
              <label htmlFor="name">Account / card</label>
              <input
                id="name"
                name="name"
                required
                placeholder="AXIS MY Zone"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="type">Type</label>
              <input
                id="type"
                name="type"
                required
                placeholder="Credit Card EMI"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="startingBalance">Starting balance</label>
              <input
                id="startingBalance"
                name="startingBalance"
                type="number"
                step="0.01"
                min="0"
                required
                inputMode="decimal"
                defaultValue="0"
              />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <input id="status" name="status" defaultValue="Active Paydown" />
            </div>
            <button className="btn btn-primary" type="submit">
              Add account
            </button>
          </ActionForm>

          {data.accounts.length === 0 ? (
            <div className="empty">Add a debt account to get started.</div>
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
                      <td className="num">{formatINR(a.startingBalanceNum)}</td>
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
          <h2>Debt reduction</h2>
          <p className="muted page-sub" style={{ marginBottom: "1rem" }}>
            Projected path to ₹0 by{" "}
            {format(new Date(goal), "MMM yyyy")} vs actual remaining.
          </p>
          <DebtReductionChart points={curve} />
        </section>
      </div>

      <div className="chart-grid">
        <section className="panel">
          <h2>Payment log</h2>
          <ActionForm
            action={createDebtPayment}
            successMessage="Payment logged"
            errorMessage="Could not add payment"
            className="form-row"
            style={{ marginBottom: "1rem" }}
            resetOnSuccess
          >
            <div className="field">
              <label htmlFor="dueDate">Due date</label>
              <input id="dueDate" name="dueDate" type="date" required />
            </div>
            <div className="field">
              <label htmlFor="accountId">Account</label>
              <select
                id="accountId"
                name="accountId"
                required
                defaultValue={data.accounts[0]?.id}
              >
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="paymentType">Payment type</label>
              <input id="paymentType" name="paymentType" defaultValue="EMI" />
            </div>
            <div className="field">
              <label htmlFor="amount">Amount</label>
              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label htmlFor="isPaid">Paid?</label>
              <select id="isPaid" name="isPaid" defaultValue="true">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={data.accounts.length === 0}
            >
              Add payment
            </button>
          </ActionForm>

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

        <section className="panel">
          <h2>Payoff curve</h2>
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
  );
}
