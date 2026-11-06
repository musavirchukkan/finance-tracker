import Link from "next/link";
import { AccountSettings } from "@/components/account-settings";
import { ExportDataCard } from "@/components/export-data";
import { InfoTip } from "@/components/info-tip";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { SettingsForms } from "@/components/settings-forms";
import { ThemeToggle } from "@/components/theme-toggle";
import { listCategories } from "@/lib/ledger-data";
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
        </div>
        <InfoTip title="Settings" label="About settings">
          <p>
            Manage your account, theme, home-screen install, categories, and
            offline export.
          </p>
        </InfoTip>
      </div>

      <AccountSettings
        email={user.email ?? ""}
        name={user.name ?? "there"}
      />

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Activity</h2>
            <p className="muted page-sub" style={{ margin: "0.25rem 0 0" }}>
              Review creates, edits, and deletes with before/after values.
            </p>
          </div>
        </div>
        <div className="dash-actions" style={{ justifyContent: "flex-start" }}>
          <Link href="/activity" className="btn btn-primary">
            Open activity log
          </Link>
        </div>
      </section>

      <ThemeToggle />

      <PwaInstallCard />

      <ExportDataCard />

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
