import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import {
  AddDebtPaymentButton,
  EditDebtAccountButton,
} from "@/components/debt-forms";
import { InfoTip } from "@/components/info-tip";
import {
  deleteDebtAccount,
  deleteDebtPayment,
  getDebtAccountDetail,
  toggleDebtPaymentPaid,
} from "@/lib/actions";
import { listCreditCards } from "@/lib/card-actions";
import { PAID_TO_DATE_TYPE } from "@/lib/debt-account";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";

export default async function DebtDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getDebtAccountDetail(user.id, id);
  if (!data) notFound();

  const cards = await listCreditCards(user.id);
  const creditCardOptions = cards.map((c) => ({
    id: c.id,
    name: c.name,
    label: c.label,
  }));
  const { account, payments } = data;
  const visiblePayments = payments.filter(
    (p) => p.paymentType !== PAID_TO_DATE_TYPE,
  );
  const accountOptions = [
    { id: account.id, name: account.name, type: account.type },
  ];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="muted page-sub" style={{ marginBottom: "0.35rem" }}>
            <Link className="linkish" href="/debt">
              ← Debt
            </Link>
          </p>
          <h2 className="page-title">{account.name}</h2>
          <p className="muted page-sub">
            {account.type} · {account.status}
          </p>
        </div>
        <div className="dash-actions">
          <EditDebtAccountButton
            creditCards={creditCardOptions}
            account={{
              id: account.id,
              name: account.name,
              type: account.type,
              creditCardId: account.creditCardId,
              startingBalance: account.startingBalance,
              monthlyEmi: account.monthlyEmi,
              interestPercent: account.interestPercent,
              totalMonths: account.totalMonths,
              monthsPaid: account.monthsPaid,
              paidTillNow: account.paidTillNow,
              status: account.status,
            }}
          />
          <ActionForm
            action={deleteDebtAccount}
            successMessage="Account deleted"
            errorMessage="Could not delete account"
            confirmMessage={`Delete “${account.name}”?`}
            onSuccessHref="/debt"
          >
            <input type="hidden" name="id" value={account.id} />
            <button className="btn btn-danger btn-xs" type="submit">
              Delete
            </button>
          </ActionForm>
        </div>
      </div>

      <div className="stat-grid cols-3">
        <div className="stat-card tall">
          <span>Starting</span>
          <strong>{formatINR(account.startingBalanceNum)}</strong>
        </div>
        <div className="stat-card tall income">
          <span>Paid</span>
          <strong>{formatINR(account.totalPaid)}</strong>
        </div>
        <div className="stat-card tall left">
          <span>Remaining</span>
          <strong>{formatINR(account.pending)}</strong>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Details</h2>
          <InfoTip title="Debt details" label="About debt details">
            <p>
              <strong>Remaining</strong> is starting balance minus payments
              logged. Monthly interest is estimated from the interest % on the
              remaining principal.
            </p>
            <p>
              If this is a credit-card EMI, it is linked to a card so the EMI
              counts toward that card&apos;s due and blocks available credit.
            </p>
          </InfoTip>
        </div>
        <dl className="debt-detail-grid">
          <div>
            <dt>Type</dt>
            <dd>{account.type}</dd>
          </div>
          {account.creditCardId && account.creditCardName ? (
            <div>
              <dt>Credit card</dt>
              <dd>
                <Link className="linkish" href={`/cards/${account.creditCardId}`}>
                  {account.creditCardName}
                </Link>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Status</dt>
            <dd>{account.status}</dd>
          </div>
          <div>
            <dt>Monthly EMI</dt>
            <dd>{formatINR(account.monthlyEmiNum)}</dd>
          </div>
          <div>
            <dt>Interest %</dt>
            <dd>{account.interestPercentNum}%</dd>
          </div>
          <div>
            <dt>Monthly interest</dt>
            <dd>{formatINR(account.monthlyInterest)}</dd>
          </div>
          <div>
            <dt>Total interest</dt>
            <dd>{formatINR(account.totalInterest)}</dd>
          </div>
          <div>
            <dt>Tenure</dt>
            <dd>
              {account.totalMonths > 0
                ? `${account.monthsPaid} / ${account.totalMonths} mo`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Months left</dt>
            <dd>{account.totalMonths > 0 ? account.monthsLeft : "—"}</dd>
          </div>
          <div>
            <dt>Principal paid (saved)</dt>
            <dd>{formatINR(account.paidTillNow)}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Payments</h2>
          <AddDebtPaymentButton
            accounts={accountOptions}
            defaultAccountId={account.id}
          />
        </div>

        {visiblePayments.length === 0 ? (
          <div className="empty">No payments logged yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Type</th>
                  <th className="num">Amount</th>
                  <th>Paid?</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiblePayments.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{p.dueDate}</td>
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
                        <button className="btn btn-danger btn-xs" type="submit">
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
  );
}
