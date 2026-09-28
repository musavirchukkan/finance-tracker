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

      <SettingsForms
        goal={goal}
        expenses={expenses.map((c) => ({ id: c.id, name: c.name }))}
        incomes={incomes.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
