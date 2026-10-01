import { AccountSettings } from "@/components/account-settings";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { SettingsForms } from "@/components/settings-forms";
import { ThemeToggle } from "@/components/theme-toggle";
import { listCategories } from "@/lib/actions";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await requireUser();
  const cats = await listCategories(user.id);
  const expenses = cats.filter((c) => c.kind !== "income");
  const incomes = cats.filter((c) => c.kind === "income");

  return (
    <div className="page-stack settings-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="muted page-sub">
            Account, theme, install Ledger, categories, and offline data.
          </p>
        </div>
      </div>

      <AccountSettings
        email={user.email ?? ""}
        name={user.name ?? "there"}
      />

      <ThemeToggle />

      <PwaInstallCard />

      <SettingsForms
        expenses={expenses.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
        }))}
        incomes={incomes.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
        }))}
      />
    </div>
  );
}
