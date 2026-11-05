import Link from "next/link";
import {
  AddInvestmentButton,
  DeleteInvestmentButton,
  EditInvestmentButton,
} from "@/components/investment-forms";
import { InfoTip } from "@/components/info-tip";
import {
  getNetWorth,
} from "@/lib/investment-data";;
import { investmentTypeLabel } from "@/lib/investments";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";

export default async function WealthPage() {
  const user = await requireUser();
  const data = await getNetWorth(user.id);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Wealth</h2>
          <p className="muted page-sub">
            Net worth from cash, investments, debt, and cards
          </p>
        </div>
        <div className="dash-actions">
          <InfoTip title="Wealth & investments" label="About wealth">
            <p>
              Assets = bank balances + investment holdings (quantity × current
              price you enter).
            </p>
            <p>
              Liabilities = remaining debt + credit card revolving outstanding.
              Savings goals are not counted separately (cash stays in bank
              balances).
            </p>
            <p>
              Prices are manual for now. Symbol / ticker is saved so live quotes
              can plug in later.
            </p>
          </InfoTip>
          <AddInvestmentButton />
        </div>
      </div>

      <div className="stat-grid cols-3">
        <div className="stat-card tall left">
          <span>Net worth</span>
          <strong className={data.netWorth >= 0 ? "pos" : "neg"}>
            {formatINR(data.netWorth)}
          </strong>
        </div>
        <div className="stat-card tall income">
          <span>Assets</span>
          <strong>{formatINR(data.assets.total)}</strong>
        </div>
        <div className="stat-card tall">
          <span>Liabilities</span>
          <strong className={data.liabilities.total > 0 ? "neg" : undefined}>
            {formatINR(data.liabilities.total)}
          </strong>
        </div>
      </div>

      <div className="split-board">
        <section className="panel">
          <div className="panel-head">
            <h2>Assets</h2>
          </div>
          <ul className="wealth-breakdown">
            <li>
              <span>
                <Link className="linkish" href="/accounts">
                  Bank cash
                </Link>
                <span className="muted"> · {data.bankCount} accounts</span>
              </span>
              <strong>{formatINR(data.assets.bankCash)}</strong>
            </li>
            <li>
              <span>
                Investments
                <span className="muted">
                  {" "}
                  · {data.holdings.length}{" "}
                  {data.holdings.length === 1 ? "holding" : "holdings"}
                </span>
              </span>
              <strong>{formatINR(data.assets.investments)}</strong>
            </li>
            {data.investmentByType.map((row) => (
              <li key={row.type} className="wealth-sub">
                <span className="muted">{investmentTypeLabel(row.type)}</span>
                <span className="muted">{formatINR(row.value)}</span>
              </li>
            ))}
            <li className="wealth-total">
              <span>Total assets</span>
              <strong>{formatINR(data.assets.total)}</strong>
            </li>
          </ul>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Liabilities</h2>
          </div>
          <ul className="wealth-breakdown">
            <li>
              <span>
                <Link className="linkish" href="/debt">
                  Debt remaining
                </Link>
                <span className="muted">
                  {" "}
                  · {data.debtAccountCount} accounts
                </span>
              </span>
              <strong>{formatINR(data.liabilities.debt)}</strong>
            </li>
            <li>
              <span>
                <Link className="linkish" href="/cards">
                  Card outstanding
                </Link>
                <span className="muted"> · {data.cardCount} cards</span>
              </span>
              <strong>{formatINR(data.liabilities.cards)}</strong>
            </li>
            <li className="wealth-total">
              <span>Total liabilities</span>
              <strong>{formatINR(data.liabilities.total)}</strong>
            </li>
          </ul>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Holdings</h2>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            {data.holdings.length} · value {formatINR(data.assets.investments)}
            {data.holdingsCost > 0
              ? ` · cost ${formatINR(data.holdingsCost)}`
              : ""}
          </span>
        </div>

        {data.holdings.length === 0 ? (
          <div className="empty">
            No investments yet. Tap <strong>+ Add holding</strong> for stocks,
            mutual funds, FD, or gold. Enter quantity and current price —
            live quotes can come later.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th>Type</th>
                  <th>Platform</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th className="num">Value</th>
                  <th className="num">P/L</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <div className="tx-main">{h.name}</div>
                      {h.symbol ? (
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {h.symbol}
                        </div>
                      ) : null}
                    </td>
                    <td className="nowrap">
                      {investmentTypeLabel(h.type)}
                    </td>
                    <td className="nowrap muted">{h.platform || "—"}</td>
                    <td className="num">{h.quantityNum}</td>
                    <td className="num">{formatINR(h.currentPriceNum)}</td>
                    <td className="num">{formatINR(h.valueNum)}</td>
                    <td
                      className={`num ${
                        h.gainAmount == null
                          ? "muted"
                          : h.gainAmount >= 0
                            ? "pos"
                            : "neg"
                      }`}
                    >
                      {h.gainAmount == null
                        ? "—"
                        : `${h.gainAmount >= 0 ? "+" : ""}${formatINR(h.gainAmount)}${
                            h.gainPct != null ? ` (${h.gainPct}%)` : ""
                          }`}
                    </td>
                    <td>
                      <div className="row-actions">
                        <EditInvestmentButton holding={h} />
                        <DeleteInvestmentButton id={h.id} name={h.name} />
                      </div>
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
