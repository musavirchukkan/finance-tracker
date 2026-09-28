import { SettingsForms } from "@/components/settings-forms";
import { listCategories, getDebtDashboard } from "@/lib/actions";
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
    <div className="page-stack settings-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="muted page-sub">
            Categories, debt goal, and install tips.
          </p>
        </div>
      </div>

      <section className="panel">
        <h2>Install as app</h2>
        <p className="muted page-sub" style={{ maxWidth: "42ch", marginTop: 0 }}>
          On your phone, open Ledger in Safari or Chrome, then use Share / menu
          → <strong>Add to Home Screen</strong>. On Android Chrome, long-press
          the icon for a <strong>Quick add</strong> shortcut.
        </p>
      </section>

      <SettingsForms
        goal={goal}
        expenses={expenses.map((c) => ({ id: c.id, name: c.name }))}
        incomes={incomes.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
