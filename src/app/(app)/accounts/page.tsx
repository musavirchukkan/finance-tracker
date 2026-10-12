import Link from "next/link";
import {
  AddBankAccountButton,
  DeleteBankAccountButton,
  EditBankAccountButton,
} from "@/components/bank-forms";
import { InfoTip } from "@/components/info-tip";
import { listBankAccounts } from "@/lib/bank-actions";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";

export default async function AccountsPage() {
  const user = await requireUser();
  const accounts = await listBankAccounts(user.id);
  const totalBalance = accounts.reduce((s, a) => s + a.balanceNum, 0);

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
              Optional min balance and free-text rules (AMB, quarterly average,
              txn limits) are notes only — they do not block spends. Debit-card
              tracking under each account can come later.
            </p>
          </InfoTip>
          <AddBankAccountButton />
        </div>
      </div>

      <div className="stat-grid cols-2">
        <div className="stat-card tall left">
          <span>Total balance</span>
          <strong>{formatINR(totalBalance)}</strong>
        </div>
        <div className="stat-card tall">
          <span>Accounts</span>
          <strong>{accounts.length}</strong>
        </div>
      </div>

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
            <table className="data">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="num">Balance</th>
                  <th className="num">Min</th>
                  <th>Status</th>
                  <th>
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
                      {a.balanceRules ? (
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {a.balanceRules}
                        </div>
                      ) : null}
                    </td>
                    <td>{a.accountType}</td>
                    <td className="num">{formatINR(a.balanceNum)}</td>
                    <td className="num">
                      {a.minBalanceNum != null
                        ? formatINR(a.minBalanceNum)
                        : "—"}
                    </td>
                    <td>{a.status}</td>
                    <td>
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
