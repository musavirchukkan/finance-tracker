import { TransactionForm } from "@/components/transaction-form";
import { listCategories } from "@/lib/actions";
import { requireUser } from "@/lib/session";

export default async function QuickAddPage() {
  const user = await requireUser();
  const cats = await listCategories(user.id);

  return (
    <div className="page-stack quick-add-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Quick add</h2>
          <p className="muted page-sub">
            Fast entry — works offline. Install the app for a home-screen shortcut.
          </p>
        </div>
      </div>
      <section className="panel">
        <TransactionForm
          compact
          categories={cats.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
          }))}
        />
      </section>
    </div>
  );
}
