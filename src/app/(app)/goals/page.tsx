import { format } from "date-fns";
import Link from "next/link";
import {
  AddGoalButton,
  AddMoneyToGoalButton,
  DeleteGoalButton,
} from "@/components/goal-forms";
import { listSavingsGoals } from "@/lib/actions";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/session";

function SegmentedBar({ pct }: { pct: number }) {
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / 5);
  return (
    <div className="seg-bar" aria-hidden>
      {Array.from({ length: 20 }, (_, i) => (
        <i key={i} className={i < filled ? "on" : undefined} />
      ))}
    </div>
  );
}

export default async function GoalsPage() {
  const user = await requireUser();
  const goals = await listSavingsGoals(user.id);

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);
  const completed = goals.filter((g) => g.pct >= 100).length;

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Goals</h2>
          <p className="muted page-sub">
            Create savings goals and add money as you go.
          </p>
        </div>
        <AddGoalButton />
      </div>

      <div className="stat-grid cols-3">
        <div className="stat-card tall">
          <span>Active goals</span>
          <strong>{goals.length}</strong>
        </div>
        <div className="stat-card tall income">
          <span>Total saved</span>
          <strong>{formatINR(totalSaved)}</strong>
        </div>
        <div className="stat-card tall left">
          <span>Toward targets</span>
          <strong>
            {formatINR(totalSaved)}
            <span className="muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              {" "}
              / {formatINR(totalTarget || 0)}
            </span>
          </strong>
        </div>
      </div>

      {completed > 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          {completed} goal{completed === 1 ? "" : "s"} reached target.
        </p>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Your goals</h2>
          <Link className="linkish" href="/debt">
            Debt payoff →
          </Link>
        </div>

        {goals.length === 0 ? (
          <div className="empty">
            No goals yet. Create one to start tracking savings.
          </div>
        ) : (
          <div className="goal-cards">
            {goals.map((g) => (
              <article key={g.id} className="goal-card">
                <div className="goal-card-top">
                  <div>
                    <h3 className="goal-card-title">{g.name}</h3>
                    {g.targetDate ? (
                      <p className="goal-meta">
                        Target {format(new Date(g.targetDate), "MMM d, yyyy")}
                      </p>
                    ) : (
                      <p className="goal-meta">No target date</p>
                    )}
                  </div>
                  <span className={`goal-pct ${g.pct >= 100 ? "done" : ""}`}>
                    {g.pct}%
                  </span>
                </div>
                <div className="goal-row-head">
                  <span className="muted">Saved</span>
                  <span>
                    {formatINR(g.currentAmount)} / {formatINR(g.targetAmount)}
                  </span>
                </div>
                <SegmentedBar pct={g.pct} />
                <div className="goal-card-foot">
                  <span className="muted">
                    {g.remaining > 0
                      ? `${formatINR(g.remaining)} left`
                      : "Target reached"}
                  </span>
                  <div className="goal-card-actions">
                    <DeleteGoalButton goalId={g.id} goalName={g.name} />
                    <AddMoneyToGoalButton
                      goalId={g.id}
                      goalName={g.name}
                      remaining={g.remaining}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
