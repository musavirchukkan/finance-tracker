import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import {
  CardFeeButton,
  DeleteCardActivityButton,
  EditCreditCardButton,
  PayBillButton,
  WalletRechargeButton,
} from "@/components/card-forms";
import { InfoTip } from "@/components/info-tip";
import { ReviewCallout } from "@/components/review-callout";
import { listBankAccounts } from "@/lib/bank-actions";
import {
  deleteCreditCard,
  getCreditCardDetail,
  listCreditCards,
} from "@/lib/card-actions";
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

  const banks = await listBankAccounts(user.id);
  const bankOptions = banks.map((a) => ({ id: a.id, name: a.name }));
  const allCards = await listCreditCards(user.id);
  const shareOptions = allCards
    .filter((c) => !c.sharesLimitWithId && c.id !== id)
    .map((c) => ({ id: c.id, label: c.label }));
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
          <h2 className="page-title">{card.label}</h2>
          <p className="muted page-sub">
            {card.status}
            {card.isRupay ? " · RuPay UPI" : ""}
            {card.sharesLimit ? " · Shared limit" : ""}
          </p>
        </div>
        <div className="dash-actions">
          <EditCreditCardButton card={card} shareOptions={shareOptions} />
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
          <span>Due to pay</span>
          <strong>{formatINR(card.amountDue)}</strong>
        </div>
        <div className="stat-card tall">
          <span>{card.sharesLimit ? "Shared available" : "Available"}</span>
          <strong
            className={
              card.availableNum != null && card.availableNum < 0
                ? "neg"
                : undefined
            }
          >
            {card.availableNum != null ? formatINR(card.availableNum) : "—"}
          </strong>
        </div>
        <div className="stat-card tall">
          <span>Revolving outstanding</span>
          <strong>{formatINR(card.outstandingNum)}</strong>
        </div>
      </div>

      {card.availableNum != null && card.availableNum < 0 ? (
        <ReviewCallout title="Negative available — review ledger">
          <p>
            Available is {formatINR(card.availableNum)}
            {card.sharesLimit ? " on this shared limit" : ""}
            {card.sharesLimit && card.sharedWithLabels.length > 0
              ? ` (with ${card.sharedWithLabels.join(", ")})`
              : ""}
            . Ledger never blocks spends for that — you may be missing a bill
            payment, or a debt EMI that should be linked to this card.
          </p>
          <p>
            Add the missing payment or link the EMI with its real date. The
            negative clears once the books catch up.
          </p>
        </ReviewCallout>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Bill cycle</h2>
          <InfoTip title="Due & available" label="How due and available work">
            <p>
              <strong>Due to pay</strong> = statement due + linked EMI for the
              month.
            </p>
            <p>
              <strong>Available</strong> = credit limit − revolving outstanding −
              EMI remaining (blocked)
              {card.sharesLimit
                ? ", pooled across every card that shares this limit."
                : "."}
            </p>
            <p>
              Spends after the bill date go on the next statement (next bill
              open).
            </p>
          </InfoTip>
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
            <dt>Last statement</dt>
            <dd>{card.lastBillDate ?? "—"}</dd>
          </div>
          <div>
            <dt>Payment due</dt>
            <dd>{card.nextDueDate ?? "—"}</dd>
          </div>
          <div>
            <dt>Next statement</dt>
            <dd>{card.nextBillDate ?? "—"}</dd>
          </div>
          <div>
            <dt>{card.sharesLimit ? "Shared credit limit" : "Credit limit"}</dt>
            <dd>
              {card.creditLimitNum != null
                ? formatINR(card.creditLimitNum)
                : "—"}
            </dd>
          </div>
          {card.sharesLimit ? (
            <>
              <div>
                <dt>Shared with</dt>
                <dd>
                  {card.sharedWithLabels.length > 0
                    ? card.sharedWithLabels.join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Group revolving</dt>
                <dd>{formatINR(card.groupRevolvingNum)}</dd>
              </div>
              <div>
                <dt>Group EMI blocked</dt>
                <dd>{formatINR(card.groupEmiBlockedNum)}</dd>
              </div>
            </>
          ) : null}
          <div>
            <dt>Statement due</dt>
            <dd>{formatINR(card.statementDueNum)}</dd>
          </div>
          <div>
            <dt>EMI this month</dt>
            <dd>{formatINR(card.emiMonthlyNum)}</dd>
          </div>
          <div>
            <dt>EMI remaining (blocked)</dt>
            <dd>{formatINR(card.emiBlockedNum)}</dd>
          </div>
          <div>
            <dt>Next bill (open)</dt>
            <dd>{formatINR(card.nextBillPending)}</dd>
          </div>
        </dl>
      </section>

      {card.linkedEmis.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Linked EMI</h2>
            <InfoTip title="Linked EMI" label="About linked EMI">
              <p>
                Debts of type credit-card EMI linked to this card. Monthly EMI
                adds to due to pay; remaining principal blocks available credit.
              </p>
            </InfoTip>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Debt</th>
                  <th className="num">Monthly EMI</th>
                  <th className="num">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {card.linkedEmis.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link className="linkish" href={`/debt/${e.id}`}>
                        {e.name}
                      </Link>
                    </td>
                    <td className="num">{formatINR(e.monthlyEmi)}</td>
                    <td className="num">{formatINR(e.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Actions</h2>
          <div className="dash-actions">
            <WalletRechargeButton cardId={card.id} />
            <CardFeeButton cardId={card.id} />
            <PayBillButton cardId={card.id} bankAccounts={bankOptions} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Activity</h2>
          <InfoTip title="Card activity" label="About card activity">
            <p>
              <strong>Amount</strong> is the transaction total.{" "}
              <strong>On card</strong> is how much changed revolving outstanding
              (wallet top-ups may charge the card differently than wallet
              credit).
            </p>
          </InfoTip>
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
