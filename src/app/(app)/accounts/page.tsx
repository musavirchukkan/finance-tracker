import Link from "next/link";
import {
  AddBankAccountButton,
  DeleteBankAccountButton,
  EditBankAccountButton,
} from "@/components/bank-forms";
import { InfoTip } from "@/components/info-tip";
import { ReviewCallout } from "@/components/review-callout";
import { listBankAccounts } from "@/lib/bank-actions";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";

export default async function AccountsPage() {
  const user = await requireUser();
  const accounts = await listBankAccounts(user.id);
  const totalBalance = accounts.reduce((s, a) => s + a.balanceNum, 0);
  const negativeAccounts = accounts.filter((a) => a.balanceNum < 0);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Accounts</h2>
        </div>
        <div className="dash-actions">
          <InfoTip title="Bank accounts" label="About bank accounts">
            <p>
              Track bank and wallet balances. Pick an account when you add income
              or expenses so cashflow stays linked.
            </p>
            <p>
              Spends are never blocked if the ledger goes negative — that usually
              means a missing income, refund, or bill payment. Add the missing
              txn (with its real date) or edit the balance to match the bank.
            </p>
          </InfoTip>
          <AddBankAccountButton />
        </div>
      </div>

      <div className="stat-grid cols-2">
        <div className="stat-card tall left">
          <span>Total balance</span>
          <strong className={totalBalance < 0 ? "neg" : undefined}>
            {formatINR(totalBalance)}
          </strong>
        </div>
        <div className="stat-card tall">
          <span>Accounts</span>
          <strong>{accounts.length}</strong>
        </div>
      </div>

      {negativeAccounts.length > 0 ? (
        <ReviewCallout title="Negative balances to review">
          <p>
            {negativeAccounts.map((a) => a.label).join(", ")}{" "}
            {negativeAccounts.length === 1 ? "is" : "are"} below ₹0. That is
            allowed — check for a missing credit/income or update the latest
            bank balance. Once the missing txn is logged, the balance should
            recover.
          </p>
        </ReviewCallout>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Bank accounts</h2>
        </div>

        {accounts.length === 0 ? (
          <div className="empty">
            No accounts yet. Tap <strong>+ Add account</strong> to track balances.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data distribute">
              <colgroup>
                <col className="col-account" />
                <col className="col-type" />
                <col className="col-balance" />
                <col className="col-min" />
                <col className="col-status" />
                <col className="col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="num">Balance</th>
                  <th className="num">Min</th>
                  <th>Status</th>
                  <th className="shrink">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="tx-main">
                      <Link className="linkish" href={`/accounts/${a.id}`}>
                        {a.label}
                      </Link>
                    </td>
                    <td>{a.accountType}</td>
                    <td className={`num${a.balanceNum < 0 ? " neg" : ""}`}>
                      {formatINR(a.balanceNum)}
                    </td>
                    <td className="num">
                      {a.balanceRules ? (
                        <span
                          className="min-balance-tip"
                          data-tip={a.balanceRules}
                          tabIndex={0}
                          aria-label={`Minimum balance note: ${a.balanceRules}`}
                        >
                          {a.minBalanceNum != null
                            ? formatINR(a.minBalanceNum)
                            : "—"}
                        </span>
                      ) : a.minBalanceNum != null ? (
                        formatINR(a.minBalanceNum)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{a.status}</td>
                    <td className="shrink">
                      <div className="row-actions">
                        <Link
                          className="btn btn-ghost btn-xs"
                          href={`/accounts/${a.id}`}
                        >
                          View
                        </Link>
                        <EditBankAccountButton account={a} />
                        <DeleteBankAccountButton
                          accountId={a.id}
                          name={a.name}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="num">{formatINR(totalBalance)}</td>
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
