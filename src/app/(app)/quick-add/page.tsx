import { TransactionForm } from "@/components/transaction-form";
import { listCategories } from "@/lib/actions";
import { requireUser } from "@/lib/session";

export default async function QuickAddPage() {
  const user = await requireUser();
  const cats = await listCategories(user.id);

  return (
    <div className="page-stack quick-add-page">
      <section className="panel qa-page-panel">
        <TransactionForm
          variant="quick"
          categories={cats.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
            icon: c.icon,
          }))}
        />
      </section>
    </div>
  );
}
