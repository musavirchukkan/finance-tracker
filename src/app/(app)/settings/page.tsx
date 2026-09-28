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
  const expenses = cats.filter((c) => c.kind !== "income");
  const incomes = cats.filter((c) => c.kind === "income");

  return (
    <div className="page-stack" style={{ maxWidth: 720 }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="muted page-sub">Categories, debt goal, and app tips.</p>
        </div>
      </div>

      <section className="panel">
        <h2>Install as app (PWA)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          On phone: open in Safari/Chrome → Share / menu → <strong>Add to Home Screen</strong>.
          Long-press the icon for <strong>Quick add</strong> (Android Chrome shortcuts).
        </p>
      </section>

      <section className="panel">
        <h2>Categories</h2>
        <form action={createCategory} className="form-stack" style={{ marginBottom: "1rem" }}>
          <div className="field">
            <label htmlFor="name">New category</label>
            <input id="name" name="name" required placeholder="Subscriptions" />
          </div>
          <div className="field">
            <label htmlFor="kind">Type</label>
            <select id="kind" name="kind" defaultValue="expense">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <button className="btn btn-primary" type="submit">
            Add
          </button>
        </form>

        <h3 className="section-sub">Expense</h3>
        <ul className="cat-list">
          {expenses.map((c) => (
            <li key={c.id}>
              <span>{c.name}</span>
              <form action={deleteCategory}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn btn-danger btn-xs" type="submit">
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>

        <h3 className="section-sub">Income</h3>
        <ul className="cat-list">
          {incomes.map((c) => (
            <li key={c.id}>
              <span>{c.name}</span>
              <form action={deleteCategory}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn btn-danger btn-xs" type="submit">
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Debt payoff goal</h2>
        <form action={updateDebtGoal} className="form-stack">
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
