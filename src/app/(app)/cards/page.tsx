import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import {
  AddCreditCardButton,
  EditCreditCardButton,
  PayBillButton,
} from "@/components/card-forms";
import { InfoTip } from "@/components/info-tip";
import { ReviewCallout } from "@/components/review-callout";
import {
  listBankAccounts,
} from "@/lib/bank-data";
import {
  deleteCreditCard,
} from "@/lib/card-crud-actions";
import {
  listCreditCards,
  listLedgerPaymentWarnings,
} from "@/lib/card-data";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";

function IconView() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 12h10l1-12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStatusActive() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.5 12.5l2.2 2.2 4.8-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStatusInactive() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9 12h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default async function CardsPage() {
  const user = await requireUser();
  const cards = await listCreditCards(user.id);
  const banks = await listBankAccounts(user.id);
  const bankOptions = banks.map((a) => ({ id: a.id, name: a.label ?? a.name }));
  const paymentWarnings = await listLedgerPaymentWarnings(user.id, cards);
  const billWarnings = paymentWarnings.filter(
    (w) => w.href?.startsWith("/cards"),
  );
  const totalOutstanding = cards.reduce((s, c) => s + c.outstandingNum, 0);
  const totalDue = cards.reduce((s, c) => s + c.amountDue, 0);
  const totalEmi = cards.reduce((s, c) => s + c.emiMonthlyNum, 0);
  const totalNextBill = cards.reduce((s, c) => s + c.nextBillPending, 0);
  const shareOptions = cards
    .filter((c) => !c.sharesLimitWithId)
    .map((c) => ({
      id: c.id,
      label: c.label,
      creditLimit: c.ownCreditLimitNum ?? c.creditLimitNum,
    }));
  // One note per shared-limit root (or single card) with negative available.
  const overLimitCards = cards.filter(
    (c) =>
      c.availableNum != null &&
      c.availableNum < 0 &&
      (!c.sharesLimitWithId || c.sharedLimitRootId === c.id),
  );

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
              <strong>Due to pay</strong> only after you include the bank bill
              (statement amount or &quot;Include on this month&apos;s bill&quot;).
              Until then, revolving balance waits on the next statement — no
              overdue nag for a bill that has not been generated yet.
            </p>
            <p>
              On each statement date, linked CC EMI (principal + interest + GST)
              posts onto outstanding and unlocks principal from the limit. Pay
              via <strong>Pay bill</strong> when the bank due date arrives.
            </p>
            <p>
              <strong>Available</strong> = shared limit − positive revolving −
              EMI principal blocked across the group. Prepaid / overpay on one
              card stays on that card and does not boost siblings&apos; limit.
              Interest/GST on EMI do not block the limit.
            </p>
            <p>
              Available can go negative if the ledger is over limit — spends are
              never blocked. Use the review note to catch missing payments or
              EMI links, then the books catch up.
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

      {billWarnings.length > 0 ? (
        <ReviewCallout
          title={
            billWarnings.some((w) => w.severity === "urgent")
              ? "Overdue bill — pay now"
              : "Unpaid bill — reminder"
          }
        >
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {billWarnings.map((w) => (
              <li key={w.message}>
                {w.href ? (
                  <Link className="linkish" href={w.href}>
                    {w.message}
                  </Link>
                ) : (
                  w.message
                )}
              </li>
            ))}
          </ul>
        </ReviewCallout>
      ) : null}

      {overLimitCards.length > 0 ? (
        <ReviewCallout title="Negative available — review">
          <p>
            {overLimitCards
              .map(
                (c) =>
                  `${c.label} (${
                    c.availableNum != null
                      ? formatINR(c.availableNum)
                      : formatINR(-c.overLimitNum)
                  }${
                    c.sharesLimit && c.sharedWithLabels.length > 0
                      ? ` · shared with ${c.sharedWithLabels.join(", ")}`
                      : ""
                  })`,
              )
              .join("; ")}{" "}
            {overLimitCards.length === 1 ? "is" : "are"} over the credit limit.
            That is allowed — check for a missing bill payment or an EMI that
            should be linked. Once the books catch up, available recovers.
          </p>
        </ReviewCallout>
      ) : null}

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
                  <th>Bill date</th>
                  <th>Due date</th>
                  <th className="status-col">Status</th>
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
                    <td
                      className={`num${
                        c.availableNum != null && c.availableNum < 0
                          ? " neg"
                          : ""
                      }`}
                    >
                      {c.availableNum != null
                        ? formatINR(c.availableNum)
                        : "—"}
                    </td>
                    <td className="num">{formatINR(c.nextBillPending)}</td>
                    <td className="nowrap">{c.nextBillDate ?? "—"}</td>
                    <td className="nowrap">{c.nextDueDate ?? "—"}</td>
                    <td className="status-col">
                      {c.status === "Inactive" ? (
                        <span
                          className="status-icon status-icon-inactive has-tip"
                          data-tip="Inactive"
                          aria-label="Inactive"
                        >
                          <IconStatusInactive />
                        </span>
                      ) : (
                        <span
                          className="status-icon status-icon-active has-tip"
                          data-tip="Active"
                          aria-label="Active"
                        >
                          <IconStatusActive />
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions-grid">
                        <PayBillButton
                          cardId={c.id}
                          bankAccounts={bankOptions}
                          dueAmount={c.amountDue}
                          outstandingAmount={c.outstandingNum}
                          iconOnly
                        />
                        <Link
                          className="row-icon-btn has-tip"
                          href={`/cards/${c.id}`}
                          aria-label={`View ${c.name}`}
                          data-tip="View"
                        >
                          <IconView />
                        </Link>
                        <EditCreditCardButton
                          card={c}
                          shareOptions={shareOptions}
                          iconOnly
                        />
                        <ActionForm
                          action={deleteCreditCard}
                          successMessage="Card deleted"
                          errorMessage="Could not delete card"
                          confirmMessage={`Delete “${c.name}”?`}
                        >
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            className="row-icon-btn row-icon-btn-danger has-tip"
                            type="submit"
                            aria-label={`Delete ${c.name}`}
                            data-tip="Delete"
                          >
                            <IconDelete />
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
                  <td className="num">—</td>
                  <td className="num">
                    {formatINR(totalNextBill)} next bill
                  </td>
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
