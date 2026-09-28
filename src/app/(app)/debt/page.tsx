import { format } from "date-fns";
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
  const goal =
    data.settings?.goalPayoffDate ?? defaultGoalDate(19);
  const baselineMonth = currentYearMonth();

  const curve = buildPayoffCurve({
    totalStartingDebt: data.totals.starting,
    goalPayoffDate: goal,
    baselineMonth,
    paymentsByMonth: data.paymentsByMonth,
  });

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "1rem",
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
            Debt Account Tracker
          </h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Track accounts, payments, and projected vs actual payoff.
          </p>
        </div>
        <form action={updateDebtGoal} className="form-row" style={{ maxWidth: 320 }}>
          <div className="field">
            <label htmlFor="goalPayoffDate">Goal payoff date</label>
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
        </form>
      </div>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <section className="panel">
          <h2>Master Debt & Account Tracker</h2>
          <form action={createDebtAccount} className="form-row" style={{ marginBottom: "1rem" }}>
            <div className="field">
              <label htmlFor="name">Account / card</label>
              <input id="name" name="name" required placeholder="AXIS MY Zone" />
            </div>
            <div className="field">
              <label htmlFor="type">Type</label>
              <input id="type" name="type" required placeholder="Credit Card EMI" />
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
          </form>

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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td>{a.type}</td>
                      <td className="num">{formatINR(a.startingBalanceNum)}</td>
                      <td className="num">{formatINR(a.totalPaid)}</td>
                      <td className="num">{formatINR(a.pending)}</td>
                      <td>{a.status}</td>
                      <td>
                        <form action={deleteDebtAccount}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="btn btn-danger" type="submit" style={{ padding: "0.3rem 0.55rem" }}>
                            Delete
                          </button>
                        </form>
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
          <h2>Debt Reduction</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
            Blue = projected path to ₹0 by {format(new Date(goal), "MMM yyyy")}. Green = actual remaining.
          </p>
          <DebtReductionChart points={curve} />
        </section>
      </div>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <section className="panel">
          <h2>Payment Log</h2>
          <form action={createDebtPayment} className="form-row" style={{ marginBottom: "1rem" }}>
            <div className="field">
              <label htmlFor="dueDate">Due date</label>
              <input id="dueDate" name="dueDate" type="date" required />
            </div>
            <div className="field">
              <label htmlFor="accountId">Account</label>
              <select id="accountId" name="accountId" required defaultValue={data.accounts[0]?.id}>
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
              <input id="amount" name="amount" type="number" step="0.01" min="0" required />
            </div>
            <div className="field">
              <label htmlFor="isPaid">Paid?</label>
              <select id="isPaid" name="isPaid" defaultValue="true">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit" disabled={data.accounts.length === 0}>
              Add payment
            </button>
          </form>

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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.dueDate}</td>
                      <td>{p.accountName}</td>
                      <td>{p.paymentType}</td>
                      <td className="num">{formatINR(p.amount)}</td>
                      <td>
                        <form action={toggleDebtPaymentPaid}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="isPaid" value={String(p.isPaid)} />
                          <button className="btn btn-ghost" type="submit" style={{ padding: "0.3rem 0.55rem" }}>
                            {p.isPaid ? "✓ Paid" : "○ Unpaid"}
                          </button>
                        </form>
                      </td>
                      <td>
                        <form action={deleteDebtPayment}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="btn btn-danger" type="submit" style={{ padding: "0.3rem 0.55rem" }}>
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

        <section className="panel">
          <h2>Payoff Curve</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Projected target</th>
                  <th className="num">Actual remaining</th>
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
