/** Canonical debt account type presets shown in the UI. */
export const DEBT_TYPE_PRESETS = [
  "Credit Card EMI",
  "Personal Loan",
  "Monthly payment",
  "Borrowed",
  "Lent",
  "Kuri",
  "Credit Line",
] as const;

export type DebtTypePreset = (typeof DEBT_TYPE_PRESETS)[number];

/** Labels for the type dropdown. */
export const DEBT_TYPE_OPTIONS: {
  value: DebtTypePreset;
  label: string;
}[] = [
  { value: "Credit Card EMI", label: "Credit Card EMI" },
  { value: "Personal Loan", label: "Personal Loan" },
  { value: "Monthly payment", label: "Monthly payment" },
  { value: "Borrowed", label: "Borrowed (I owe)" },
  { value: "Lent", label: "Lent (they owe me)" },
  { value: "Kuri", label: "Kuri" },
  { value: "Credit Line", label: "Credit Line" },
];

export function normalizeDebtType(type: string) {
  return type.trim().toLowerCase();
}

export function isBorrowedType(type: string) {
  return normalizeDebtType(type) === "borrowed";
}

export function isLentType(type: string) {
  return normalizeDebtType(type) === "lent";
}

export function isKuriType(type: string) {
  const t = normalizeDebtType(type);
  return t === "kuri" || t === "chit" || t === "chit fund";
}

export function isCreditCardType(type: string) {
  const t = normalizeDebtType(type);
  return t === "credit card" || t === "cc" || t === "credit card rolling";
}

export function isCreditLineType(type: string) {
  const t = normalizeDebtType(type);
  return t === "credit line" || t === "line of credit" || t === "loc";
}

/** Revolving card balances — charges + bill payments. */
export function isRevolvingCreditType(type: string) {
  return isCreditCardType(type);
}

export function isNoInterestType(type: string) {
  const t = normalizeDebtType(type);
  return (
    t === "monthly payment" ||
    t === "installment" ||
    t === "no interest" ||
    t === "0% emi"
  );
}

export function isLoanLikeType(type: string) {
  const t = normalizeDebtType(type);
  return (
    t.includes("emi") ||
    t.includes("loan") ||
    isCreditLineType(type) ||
    isNoInterestType(type) ||
    (!isBorrowedType(type) &&
      !isLentType(type) &&
      !isKuriType(type) &&
      !isRevolvingCreditType(type))
  );
}

/** Payment types that reduce outstanding (principal / commitment). */
export const PAYDOWN_PAYMENT_TYPES = [
  "EMI",
  "Part payment",
  "Interest",
  "Other",
  "Contribution",
  "Bill payment",
  "Repayment",
] as const;

/** Income events that should not change outstanding. */
export const PAYOUT_PAYMENT_TYPES = ["Kuri payout", "Wallet → bank"] as const;

/** Events that increase outstanding (e.g. CC wallet recharge). */
export const CHARGE_PAYMENT_TYPES = ["Wallet recharge", "CC charge"] as const;

export type PaymentBalanceEffect = "paydown" | "payout" | "charge" | "ignore";

export function paymentBalanceEffect(
  paymentType: string,
): PaymentBalanceEffect {
  const t = paymentType.trim().toLowerCase();
  if (t === "paid to date") return "paydown";
  if (PAYOUT_PAYMENT_TYPES.some((p) => p.toLowerCase() === t)) return "payout";
  if (CHARGE_PAYMENT_TYPES.some((p) => p.toLowerCase() === t)) return "charge";
  if (PAYDOWN_PAYMENT_TYPES.some((p) => p.toLowerCase() === t)) return "paydown";
  // Unknown types default to paydown (same as EMI / other).
  return "paydown";
}

export function paymentOptionsForAccountType(accountType: string): string[] {
  if (isKuriType(accountType)) {
    return ["Contribution", "Kuri payout", "Other"];
  }
  if (isRevolvingCreditType(accountType)) {
    return [
      "Bill payment",
      "Wallet recharge",
      "Wallet → bank",
      "Part payment",
      "Other",
    ];
  }
  if (isLentType(accountType)) {
    return ["Repayment", "Part payment", "Other"];
  }
  if (isBorrowedType(accountType)) {
    return ["Repayment", "EMI", "Part payment", "Other"];
  }
  if (isNoInterestType(accountType)) {
    return ["EMI", "Part payment", "Other"];
  }
  // Personal loan, credit line, CC EMI, etc.
  return ["EMI", "Part payment", "Interest", "Other"];
}

export function defaultPaymentTypeForAccount(accountType: string) {
  return paymentOptionsForAccountType(accountType)[0] ?? "EMI";
}

/**
 * Outstanding = starting + charges − paydowns.
 * Payouts (kuri pot, wallet→bank) do not change outstanding.
 */
export function computeOutstanding(args: {
  startingBalance: number;
  payments: { amount: number; isPaid: boolean; paymentType: string }[];
}): number {
  let charges = 0;
  let paydowns = 0;
  for (const p of args.payments) {
    if (!p.isPaid) continue;
    const effect = paymentBalanceEffect(p.paymentType);
    if (effect === "charge") charges += Math.max(0, p.amount);
    else if (effect === "paydown") paydowns += Math.max(0, p.amount);
  }
  return Math.max(0, args.startingBalance + charges - paydowns);
}

