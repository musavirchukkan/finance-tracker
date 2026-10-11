import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import {
  CardFeeButton,
  DeleteCardActivityButton,
  EditCreditCardButton,
  PayBillButton,
  WalletCashoutButton,
  WalletRechargeButton,
} from "@/components/card-forms";
import { deleteCreditCard, getCreditCardDetail } from "@/lib/card-actions";
import { activityLabel } from "@/lib/credit-cards";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getCreditCardDetail(user.id, id);
  if (!data) notFound();

  const { card, activities } = data;

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="muted page-sub" style={{ marginBottom: "0.35rem" }}>
            <Link className="linkish" href="/cards">
              ← Cards
            </Link>
          </p>
          <h2 className="page-title">{card.name}</h2>
          <p className="muted page-sub">{card.status}</p>
        </div>
        <div className="dash-actions">
          <EditCreditCardButton card={card} />
          <ActionForm
            action={deleteCreditCard}
            successMessage="Card deleted"
            errorMessage="Could not delete card"
            confirmMessage={`Delete “${card.name}”?`}
            onSuccessHref="/cards"
          >
            <input type="hidden" name="id" value={card.id} />
            <button className="btn btn-danger btn-xs" type="submit">
              Delete
            </button>
          </ActionForm>
        </div>
      </div>

      <div className="stat-grid cols-3">
        <div className="stat-card tall left">
          <span>Outstanding</span>
          <strong>{formatINR(card.outstandingNum)}</strong>
        </div>
        <div className="stat-card tall">
          <span>Credit limit</span>
          <strong>
            {card.creditLimitNum != null
              ? formatINR(card.creditLimitNum)
              : "—"}
          </strong>
        </div>
        <div className="stat-card tall">
          <span>Next due</span>
          <strong style={{ fontSize: "1.1rem" }}>
            {card.nextDueDate ?? "—"}
          </strong>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Details</h2>
        </div>
        <dl className="debt-detail-grid">
          <div>
            <dt>Billing day</dt>
            <dd>{card.billingDay ?? "—"}</dd>
          </div>
          <div>
            <dt>Payment due day</dt>
            <dd>{card.paymentDueDay ?? "—"}</dd>
          </div>
          <div>
            <dt>Next bill</dt>
            <dd>{card.nextBillDate ?? "—"}</dd>
          </div>
          <div>
            <dt>Next due</dt>
            <dd>{card.nextDueDate ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Actions</h2>
          <div className="dash-actions">
            <WalletRechargeButton cardId={card.id} />
            <WalletCashoutButton cardId={card.id} />
            <CardFeeButton cardId={card.id} />
            <PayBillButton cardId={card.id} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Activity</h2>
        </div>
        {activities.length === 0 ? (
          <div className="empty">No card activity yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Detail</th>
                  <th className="num">Amount</th>
                  <th className="num">On card</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap">{a.date}</td>
                    <td>{activityLabel(a.activityType)}</td>
                    <td>
                      {a.description}
                      {a.activityType === "wallet_recharge" &&
                      a.walletCreditNum != null &&
                      a.cardChargedNum != null ? (
                        <span className="muted">
                          {" "}
                          · wallet {formatINR(a.walletCreditNum)} / charged{" "}
                          {formatINR(a.cardChargedNum)}
                        </span>
                      ) : null}
                      {a.activityType === "wallet_cashout" &&
                      a.bankFeeNum != null &&
                      a.bankFeeNum > 0 ? (
                        <span className="muted">
                          {" "}
                          · bank fee {formatINR(a.bankFeeNum)}
                        </span>
                      ) : null}
                    </td>
                    <td className="num">{formatINR(a.amountNum)}</td>
                    <td className="num">
                      {a.outstandingDeltaNum === 0
                        ? "—"
                        : formatINR(a.outstandingDeltaNum)}
                    </td>
                    <td>
                      <DeleteCardActivityButton activityId={a.id} />
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
