import { TransactionForm } from "@/components/transaction-form";
import { listCategories } from "@/lib/actions";
import { listBankAccounts } from "@/lib/bank-actions";
import { listCreditCards } from "@/lib/card-actions";
import { requireUser } from "@/lib/session";

export default async function QuickAddPage() {
  const user = await requireUser();
  const cats = await listCategories(user.id);
  const cards = await listCreditCards(user.id);
  const banks = await listBankAccounts(user.id);

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
          creditCards={cards.map((c) => ({
            id: c.id,
            name: c.name,
            label: c.label,
            isRupay: c.isRupay,
          }))}
          bankAccounts={banks.map((a) => ({ id: a.id, name: a.name }))}
        />
      </section>
    </div>
  );
}
