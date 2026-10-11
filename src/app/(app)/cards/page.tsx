import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import {
  AddCreditCardButton,
  EditCreditCardButton,
} from "@/components/card-forms";
import { deleteCreditCard, listCreditCards } from "@/lib/card-actions";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";

export default async function CardsPage() {
  const user = await requireUser();
  const cards = await listCreditCards(user.id);
  const totalOutstanding = cards.reduce((s, c) => s + c.outstandingNum, 0);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Cards</h2>
          <p className="muted page-sub">
            Rolling credit cards — outstanding, bill cycle, wallet recharge.
          </p>
        </div>
        <div className="dash-actions">
          <AddCreditCardButton />
        </div>
      </div>

      <div className="stat-grid cols-3">
        <div className="stat-card tall">
          <span>Cards</span>
          <strong>{cards.length}</strong>
        </div>
        <div className="stat-card tall left">
          <span>Total outstanding</span>
          <strong>{formatINR(totalOutstanding)}</strong>
        </div>
        <div className="stat-card tall">
          <span>Loans & EMI</span>
          <strong>
            <Link className="linkish" href="/debt">
              Debt →
            </Link>
          </strong>
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
                  <th className="num">Outstanding</th>
                  <th>Bill</th>
                  <th>Due</th>
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
                        {c.name}
                      </Link>
                    </td>
                    <td className="num">{formatINR(c.outstandingNum)}</td>
                    <td className="nowrap">{c.nextBillDate ?? "—"}</td>
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
                        <EditCreditCardButton card={c} />
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
                  <td className="num">{formatINR(totalOutstanding)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
