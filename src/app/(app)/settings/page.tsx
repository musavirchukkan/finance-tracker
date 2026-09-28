import {
  createCategory,
  deleteCategory,
  listCategories,
  updateDebtGoal,
  getDebtDashboard,
} from "@/lib/actions";
import { defaultGoalDate } from "@/lib/debt-projection";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await requireUser();
  const cats = await listCategories(user.id);
  const debt = await getDebtDashboard(user.id);
  const goal = debt.settings?.goalPayoffDate ?? defaultGoalDate(19);

  return (
    <div style={{ display: "grid", gap: "1.25rem", maxWidth: 720 }}>
      <div>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontSize: "1.5rem",
          }}
        >
          Settings
        </h2>
        <p className="muted" style={{ margin: "0.25rem 0 0" }}>
          Manage categories and debt payoff goal.
        </p>
      </div>

      <section className="panel">
        <h2>Categories</h2>
        <form action={createCategory} className="form-row" style={{ marginBottom: "1rem" }}>
          <div className="field">
            <label htmlFor="name">New category</label>
            <input id="name" name="name" required placeholder="Subscriptions" />
          </div>
          <button className="btn btn-primary" type="submit">
            Add
          </button>
        </form>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {cats.map((c) => (
            <li
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.55rem 0",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <span>{c.name}</span>
              <form action={deleteCategory}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn btn-danger" type="submit" style={{ padding: "0.3rem 0.55rem" }}>
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Debt payoff goal</h2>
        <form action={updateDebtGoal} className="form-row">
          <div className="field">
            <label htmlFor="goalPayoffDate">Target zero-debt date</label>
            <input
              id="goalPayoffDate"
              name="goalPayoffDate"
              type="date"
              required
              defaultValue={goal}
            />
          </div>
          <button className="btn btn-primary" type="submit">
            Save
          </button>
        </form>
      </section>
    </div>
  );
}
