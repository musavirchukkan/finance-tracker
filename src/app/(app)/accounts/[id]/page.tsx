import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { EditBankAccountButton } from "@/components/bank-forms";
import { InfoTip } from "@/components/info-tip";
import { LocalDateTime } from "@/components/local-datetime";
import { ReviewCallout } from "@/components/review-callout";
import {
  deleteBankAccount,
} from "@/lib/bank-actions";
import { getBankAccountDetail } from "@/lib/bank-data";
import { formatINR } from "@/lib/money";
import { toUtcIso } from "@/lib/utc-time";
import { requireUser } from "@/lib/session";

export default async function BankAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getBankAccountDetail(user.id, id);
  if (!data) notFound();

  const { account, transactions: txs } = data;

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="muted page-sub" style={{ marginBottom: "0.35rem" }}>
            <Link className="linkish" href="/accounts">
              ← Accounts
            </Link>
          </p>
          <h2 className="page-title">{account.label}</h2>
          <p className="muted page-sub">
            {account.accountType} · {account.status}
          </p>
        </div>
        <div className="dash-actions">
          <EditBankAccountButton account={account} />
          <ActionForm
            action={deleteBankAccount}
            successMessage="Account deleted"
            errorMessage="Could not delete"
            confirmMessage={`Delete “${account.name}”?`}
            onSuccessHref="/accounts"
          >
            <input type="hidden" name="id" value={account.id} />
            <button className="btn btn-danger btn-xs" type="submit">
              Delete
            </button>
          </ActionForm>
        </div>
      </div>

      <div className="stat-grid cols-2">
        <div className="stat-card tall left">
          <span>Current balance</span>
          <strong className={account.balanceNum < 0 ? "neg" : undefined}>
            {formatINR(account.balanceNum)}
          </strong>
          {toUtcIso(account.balanceAsOf) ? (
            <p className="muted" style={{ margin: "0.4rem 0 0", fontSize: "0.8rem" }}>
              As of{" "}
              <LocalDateTime iso={toUtcIso(account.balanceAsOf)!} seconds />
            </p>
          ) : null}
        </div>
        <div className="stat-card tall">
          <span>Minimum balance</span>
          <strong>
            {account.balanceRules ? (
              <span
                className="min-balance-tip"
                data-tip={account.balanceRules}
                tabIndex={0}
                aria-label={`Minimum balance note: ${account.balanceRules}`}
              >
                {account.minBalanceNum != null
                  ? formatINR(account.minBalanceNum)
                  : "—"}
              </span>
            ) : account.minBalanceNum != null ? (
              formatINR(account.minBalanceNum)
            ) : (
              "—"
            )}
          </strong>
        </div>
      </div>

      {account.balanceNum < 0 ? (
        <ReviewCallout title="Negative balance — review ledger">
          <p>
            This account is at {formatINR(account.balanceNum)}. Ledger never
            blocks spends for that — you may be missing an income, refund, salary
            credit, or card bill payment, or the opening balance needs a refresh.
          </p>
          <p>
            Add the missing transaction with its real date, or edit this account
            and set the latest balance from the bank app (that re-anchors “as
            of” so older backfilled spends stay tracking-only). The negative
            clears once the books catch up.
          </p>
        </ReviewCallout>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Recent transactions</h2>
          <InfoTip title="Account activity" label="About account activity">
            <p>
              Shows income, expenses, and transfers that touch this account.
              Transfers always use a positive amount — From debits, To credits.
            </p>
          </InfoTip>
        </div>
        {txs.length === 0 ? (
          <div className="empty">
            No linked transactions yet. Choose this account when adding income or
            expenses.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => {
                  const occurredAtIso = toUtcIso(t.occurredAt);
                  const isCredit =
                    t.type === "income" ||
                    (t.type === "transfer" &&
                      t.transferToBankAccountId === account.id);
                  const isTransfer = t.type === "transfer";
                  return (
                  <tr key={t.id}>
                    <td className="nowrap">
                      {occurredAtIso ? (
                        <LocalDateTime iso={occurredAtIso} />
                      ) : (
                        t.date
                      )}
                    </td>
                    <td>{t.description || "—"}</td>
                    <td>{t.type}</td>
                    <td
                      className={
                        isTransfer
                          ? isCredit
                            ? "num income"
                            : "num expense"
                          : t.type === "income"
                            ? "num income"
                            : "num expense"
                      }
                    >
                      {isCredit ? "+" : "−"}
                      {formatINR(Number(t.amount))}
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
  );
}
