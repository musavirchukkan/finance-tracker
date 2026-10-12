import {
  CREDIT_CARD_CATEGORY,
  DEBT_EMI_CATEGORY,
  KURI_CATEGORY,
  LENT_CATEGORY,
  WALLET_CASHOUT_CATEGORY,
} from "@/lib/debt-cashflow";

/**
 * Expense categories that track debt / transfers — not discretionary spend.
 * They stay available on transactions but are excluded from budgets.
 */
const NON_BUDGETABLE_EXPENSE_NAMES = new Set(
  [
    DEBT_EMI_CATEGORY,
    LENT_CATEGORY,
    KURI_CATEGORY,
    CREDIT_CARD_CATEGORY,
    WALLET_CASHOUT_CATEGORY,
  ].map((n) => n.toLowerCase()),
);

export function isBudgetableCategoryName(name: string) {
  return !NON_BUDGETABLE_EXPENSE_NAMES.has(name.trim().toLowerCase());
}
