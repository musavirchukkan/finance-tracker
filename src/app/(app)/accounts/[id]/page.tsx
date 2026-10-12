import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { EditBankAccountButton } from "@/components/bank-forms";
import { InfoTip } from "@/components/info-tip";
import { deleteBankAccount, getBankAccountDetail } from "@/lib/bank-actions";
import { formatINR } from "@/lib/money";
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
          <h2 className="page-title">{account.name}</h2>
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

      <div className="stat-grid cols-1">
        <div className="stat-card tall left">
          <span>Current balance</span>
          <strong>{formatINR(account.balanceNum)}</strong>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent transactions</h2>
          <InfoTip title="Account activity" label="About account activity">
            <p>
              Shows transactions that used this account as the payment source.
              Balance moves with those income and expense entries.
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
                {txs.map((t) => (
                  <tr key={t.id}>
                    <td className="nowrap">{t.date}</td>
                    <td>{t.description || "—"}</td>
                    <td>{t.type}</td>
                    <td
                      className={
                        t.type === "income" ? "num income" : "num expense"
                      }
                    >
                      {t.type === "income" ? "+" : "−"}
                      {formatINR(Number(t.amount))}
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
