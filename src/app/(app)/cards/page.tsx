import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import {
  AddCreditCardButton,
  EditCreditCardButton,
} from "@/components/card-forms";
import { InfoTip } from "@/components/info-tip";
import { deleteCreditCard, listCreditCards } from "@/lib/card-actions";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";

export default async function CardsPage() {
  const user = await requireUser();
  const cards = await listCreditCards(user.id);
  const totalOutstanding = cards.reduce((s, c) => s + c.outstandingNum, 0);
  const totalDue = cards.reduce((s, c) => s + c.amountDue, 0);
  const totalEmi = cards.reduce((s, c) => s + c.emiMonthlyNum, 0);
  const totalNextBill = cards.reduce((s, c) => s + c.nextBillPending, 0);
  const shareOptions = cards
    .filter((c) => !c.sharesLimitWithId)
    .map((c) => ({ id: c.id, label: c.label }));

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Cards</h2>
        </div>
        <div className="dash-actions">
          <InfoTip title="Credit cards" label="About credit cards">
            <p>
              Track rolling balances, bill cycle dates, and EMI linked to each
              card.
            </p>
            <p>
              <strong>Due to pay</strong> = closed statement due + linked EMI
              this month.
            </p>
            <p>
              <strong>Available</strong> = shared limit − revolving − EMI
              blocked across every card in a shared-limit group (e.g. Axis add-on
              cards).
            </p>
          </InfoTip>
          <AddCreditCardButton shareOptions={shareOptions} />
        </div>
      </div>

      <div className="stat-grid cols-3">
        <div className="stat-card tall left">
          <span>Due this cycle</span>
          <strong>{formatINR(totalDue)}</strong>
        </div>
        <div className="stat-card tall">
          <span>EMI this month</span>
          <strong>{formatINR(totalEmi)}</strong>
        </div>
        <div className="stat-card tall">
          <span>Total outstanding</span>
          <strong>{formatINR(totalOutstanding)}</strong>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Credit cards</h2>
        </div>

        {cards.length === 0 ? (
          <div className="empty">
            No cards yet. Tap <strong>+ Add card</strong> to track outstanding
            and wallet rolls.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Card</th>
                  <th className="num">Due to pay</th>
                  <th className="num">EMI</th>
                  <th className="num">Available</th>
                  <th className="num">Next bill</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                      <tr key={c.id}>
                        <td className="tx-main">
                          <Link className="linkish" href={`/cards/${c.id}`}>
                            {c.label}
                          </Link>
                          {c.isRupay ? (
                            <span className="muted"> · RuPay</span>
                          ) : null}
                          {c.sharesLimit ? (
                            <div className="muted" style={{ fontSize: "0.8rem" }}>
                              Shared limit
                              {c.sharedWithLabels.length > 0
                                ? ` · ${c.sharedWithLabels.join(", ")}`
                                : ""}
                            </div>
                          ) : null}
                        </td>
                    <td className="num">{formatINR(c.amountDue)}</td>
                    <td className="num">
                      {c.emiMonthlyNum > 0
                        ? formatINR(c.emiMonthlyNum)
                        : "—"}
                    </td>
                    <td className="num">
                      {c.availableNum != null
                        ? formatINR(c.availableNum)
                        : "—"}
                    </td>
                    <td className="num">{formatINR(c.nextBillPending)}</td>
                    <td className="nowrap">{c.nextDueDate ?? "—"}</td>
                    <td>{c.status}</td>
                    <td>
                      <div className="row-actions">
                        <Link
                          className="btn btn-ghost btn-xs"
                          href={`/cards/${c.id}`}
                        >
                          View
                        </Link>
                        <EditCreditCardButton
                          card={c}
                          shareOptions={shareOptions}
                        />
                        <ActionForm
                          action={deleteCreditCard}
                          successMessage="Card deleted"
                          errorMessage="Could not delete card"
                          confirmMessage={`Delete “${c.name}”?`}
                        >
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            className="btn btn-danger btn-xs"
                            type="submit"
                          >
                            Del
                          </button>
                        </ActionForm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{formatINR(totalDue)}</td>
                  <td className="num">{formatINR(totalEmi)}</td>
                  <td colSpan={2} className="num">
                    {formatINR(totalNextBill)} next bill
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
