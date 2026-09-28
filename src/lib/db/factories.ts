import { format, subMonths, startOfMonth, addDays } from "date-fns";

/** Simple deterministic RNG so demo data is stable across runs. */
export function createRng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

export function money(rng: () => number, min: number, max: number): string {
  const n = min + rng() * (max - min);
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function yearMonthOffset(monthsAgo: number): string {
  return format(subMonths(new Date(), monthsAgo), "yyyy-MM");
}

export function dateInMonth(
  yearMonth: string,
  day: number,
): string {
  const base = startOfMonth(new Date(`${yearMonth}-01T12:00:00`));
  const d = addDays(base, Math.max(0, day - 1));
  // clamp to same month
  if (format(d, "yyyy-MM") !== yearMonth) {
    return format(new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0), "yyyy-MM-dd");
  }
  return format(d, "yyyy-MM-dd");
}

export type CategoryRef = { id: string; name: string; kind: string };

export const DEFAULT_EXPENSE_BUDGETS: Record<string, number> = {
  Auto: 8000,
  Entertainment: 4000,
  Food: 12000,
  Home: 25000,
  Medical: 3000,
  "Personal Items": 3500,
  Travel: 5000,
  Utilities: 4500,
  Other: 2000,
};

export const EXPENSE_TEMPLATES: Record<string, string[]> = {
  Auto: ["Fuel", "Car service", "Parking", "Uber"],
  Entertainment: ["Movie night", "Streaming", "Concert", "Games"],
  Food: ["Groceries", "Swiggy lunch", "Cafe", "Weekend dinner"],
  Home: ["Rent share", "Cleaning supplies", "Hardware store"],
  Medical: ["Pharmacy", "Doctor visit", "Lab test"],
  "Personal Items": ["Clothes", "Toiletries", "Haircut"],
  Travel: ["Train tickets", "Hotel", "Weekend trip"],
  Utilities: ["Electricity", "Internet", "Mobile recharge", "Water"],
  Other: ["Gift", "Misc expense", "Donation"],
};

export const INCOME_TEMPLATES: Record<string, { label: string; min: number; max: number }[]> =
  {
    Salary: [{ label: "Monthly salary", min: 75000, max: 85000 }],
    Freelance: [
      { label: "Client project", min: 8000, max: 25000 },
      { label: "Consulting hours", min: 5000, max: 15000 },
    ],
    "Other Income": [
      { label: "Interest credit", min: 200, max: 1200 },
      { label: "Cashback", min: 100, max: 800 },
    ],
  };

export function buildBudgetRows(
  userId: string,
  expenseCats: CategoryRef[],
  yearMonth: string,
) {
  return expenseCats.map((c) => ({
    userId,
    categoryId: c.id,
    yearMonth,
    amount: (DEFAULT_EXPENSE_BUDGETS[c.name] ?? 2000).toFixed(2),
  }));
}

export function buildMonthTransactions(
  userId: string,
  cats: CategoryRef[],
  yearMonth: string,
  rng: () => number,
) {
  const byName = new Map(cats.map((c) => [c.name, c]));
  const rows: {
    userId: string;
    date: string;
    description: string;
    categoryId: string;
    type: "expense" | "income";
    amount: string;
  }[] = [];

  // Salary once mid-month
  const salary = byName.get("Salary");
  if (salary) {
    rows.push({
      userId,
      date: dateInMonth(yearMonth, 1),
      description: "Monthly salary",
      categoryId: salary.id,
      type: "income",
      amount: money(rng, 78000, 82000),
    });
  }

  // Occasional freelance / other income
  for (const [name, templates] of Object.entries(INCOME_TEMPLATES)) {
    if (name === "Salary") continue;
    const cat = byName.get(name);
    if (!cat) continue;
    if (rng() > 0.55) continue;
    const t = pick(rng, templates);
    rows.push({
      userId,
      date: dateInMonth(yearMonth, 5 + Math.floor(rng() * 20)),
      description: t.label,
      categoryId: cat.id,
      type: "income",
      amount: money(rng, t.min, t.max),
    });
  }

  // Expenses across categories
  for (const [name, labels] of Object.entries(EXPENSE_TEMPLATES)) {
    const cat = byName.get(name);
    if (!cat) continue;
    const count = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const day = 2 + Math.floor(rng() * 26);
      const base = DEFAULT_EXPENSE_BUDGETS[name] ?? 2000;
      const amount = money(rng, base * 0.05, base * 0.35);
      rows.push({
        userId,
        date: dateInMonth(yearMonth, day),
        description: pick(rng, labels),
        categoryId: cat.id,
        type: "expense",
        amount,
      });
    }
  }

  return rows;
}

export function buildDebtAccounts(userId: string) {
  return [
    {
      userId,
      name: "AXIS MY Zone",
      type: "Credit Card EMI",
      startingBalance: "370000.00",
      status: "Active Paydown",
    },
    {
      userId,
      name: "HDFC Personal Loan",
      type: "Personal Loan",
      startingBalance: "120000.00",
      status: "Active Paydown",
    },
    {
      userId,
      name: "SBI Credit Card",
      type: "Credit Card",
      startingBalance: "45000.00",
      status: "Active Paydown",
    },
  ];
}

export function buildDebtPayments(
  userId: string,
  accounts: { id: string; name: string }[],
  rng: () => number,
) {
  const amounts: Record<string, number> = {
    "AXIS MY Zone": 2000,
    "HDFC Personal Loan": 8500,
    "SBI Credit Card": 5000,
  };

  const rows: {
    userId: string;
    accountId: string;
    dueDate: string;
    paymentType: string;
    amount: string;
    isPaid: boolean;
  }[] = [];

  for (let monthsAgo = 3; monthsAgo >= 0; monthsAgo--) {
    const ym = yearMonthOffset(monthsAgo);
    for (const account of accounts) {
      const base = amounts[account.name] ?? 3000;
      rows.push({
        userId,
        accountId: account.id,
        dueDate: dateInMonth(ym, 1),
        paymentType: account.name.includes("Loan") ? "EMI" : "Payment",
        amount: money(rng, base * 0.9, base * 1.1),
        isPaid: monthsAgo > 0 || rng() > 0.3,
      });
    }
  }

  return rows;
}
