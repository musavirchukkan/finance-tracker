import { TransactionForm } from "@/components/transaction-form";
import { ensureTransferCategory } from "@/lib/bank-account-cashflow";
import {
  listCategories,
} from "@/lib/budget-data";
import {
  listBankAccountOptions,
} from "@/lib/bank-data";
import {
  listCreditCardOptions,
} from "@/lib/card-data";
import { isActiveCardStatus } from "@/lib/credit-cards";
import { requireUser } from "@/lib/session";

export default async function QuickAddPage() {
  const user = await requireUser();
  await ensureTransferCategory(user.id);
  const cats = await listCategories(user.id);
  const cards = await listCreditCardOptions(user.id);
  const banks = await listBankAccountOptions(user.id);

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
          creditCards={cards
            .filter((c) => isActiveCardStatus(c.status))
            .map((c) => ({
              id: c.id,
              name: c.name,
              label: c.label,
              isRupay: c.isRupay,
              showInPaymentPicker: c.showInPaymentPicker,
            }))}
          bankAccounts={banks.map((a) => ({
            id: a.id,
            name: a.name,
            label: a.label,
            showInPaymentPicker: a.showInPaymentPicker,
          }))}
        />
      </section>
    </div>
  );
}
