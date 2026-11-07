import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  creditCards,
  debtAccounts,
  debtPayments,
  debtSettings,
} from "@/lib/db/schema";
import {
  DEFAULT_GST_ON_INTEREST_PERCENT,
  PAID_TO_DATE_TYPE,
  computeGstOnInterest,
  computeMonthlyInterest,
  computeTotalInterest,
  isEmiPostedToCardType,
  normalizeInterestType,
  suggestInstallmentSplit,
} from "@/lib/debt-account";
import {
  computeOutstanding,
  paymentBalanceEffect,
} from "@/lib/debt-kinds";
import { toNumber } from "@/lib/money";
import { yearMonthFromDate } from "@/lib/months";

/** Pure read — call `ensureCardLedgerSynced` when migrate must run first (H4). */
export async function getDebtDashboard(userId: string) {
  const [accounts, payments, settingsRows] = await Promise.all([
    db
      .select()
      .from(debtAccounts)
      .where(eq(debtAccounts.userId, userId))
      .orderBy(asc(debtAccounts.name)),
    db
      .select({
        id: debtPayments.id,
        accountId: debtPayments.accountId,
        accountName: debtAccounts.name,
        dueDate: debtPayments.dueDate,
        paymentType: debtPayments.paymentType,
        amount: debtPayments.amount,
        principalAmount: debtPayments.principalAmount,
        interestAmount: debtPayments.interestAmount,
        gstAmount: debtPayments.gstAmount,
        isPaid: debtPayments.isPaid,
      })
      .from(debtPayments)
      .innerJoin(
        debtAccounts,
        and(
          eq(debtPayments.accountId, debtAccounts.id),
          eq(debtAccounts.userId, userId),
        ),
      )
      .where(eq(debtPayments.userId, userId))
      .orderBy(desc(debtPayments.dueDate)),
    db
      .select()
      .from(debtSettings)
      .where(eq(debtSettings.userId, userId))
      .limit(1),
  ]);
  const [settings] = settingsRows;

  const paydownByAccount = new Map<string, number>();
  const chargeByAccount = new Map<string, number>();
  const paidToDateByAccount = new Map<string, number>();
  const paymentsByAccount = new Map<
    string,
    {
      amount: number;
      isPaid: boolean;
      paymentType: string;
      principalAmount: number | null;
    }[]
  >();

  for (const p of payments) {
    const amount = toNumber(p.amount);
    const principalAmount =
      p.principalAmount != null ? toNumber(p.principalAmount) : null;
    const list = paymentsByAccount.get(p.accountId) ?? [];
    list.push({
      amount,
      isPaid: p.isPaid,
      paymentType: p.paymentType,
      principalAmount,
    });
    paymentsByAccount.set(p.accountId, list);

    if (!p.isPaid) continue;
    const effect = paymentBalanceEffect(p.paymentType);
    const paydownCredit =
      principalAmount != null ? principalAmount : amount;
    if (effect === "paydown") {
      paydownByAccount.set(
        p.accountId,
        (paydownByAccount.get(p.accountId) ?? 0) + paydownCredit,
      );
    } else if (effect === "charge") {
      chargeByAccount.set(
        p.accountId,
        (chargeByAccount.get(p.accountId) ?? 0) + amount,
      );
    }
    if (p.paymentType === PAID_TO_DATE_TYPE) {
      paidToDateByAccount.set(
        p.accountId,
        (paidToDateByAccount.get(p.accountId) ?? 0) + paydownCredit,
      );
    }
  }

  const nextUnpaidDueByAccount = new Map<string, string>();
  for (const p of payments) {
    if (p.isPaid) continue;
    if (isEmiPostedToCardType(p.paymentType)) continue;
    const cur = nextUnpaidDueByAccount.get(p.accountId);
    if (!cur || p.dueDate < cur) {
      nextUnpaidDueByAccount.set(p.accountId, p.dueDate);
    }
  }

  const accountRows = accounts.map((a) => {
    const starting = toNumber(a.startingBalance);
    const paid = paydownByAccount.get(a.id) ?? 0;
    const charges = chargeByAccount.get(a.id) ?? 0;
    const pending = computeOutstanding({
      startingBalance: starting,
      payments: paymentsByAccount.get(a.id) ?? [],
    });
    const monthlyEmiNum = toNumber(a.monthlyEmi);
    const interestPercent = toNumber(a.interestPercent);
    const gstPercent =
      a.gstPercent != null
        ? toNumber(a.gstPercent)
        : DEFAULT_GST_ON_INTEREST_PERCENT;
    const interestType = normalizeInterestType(a.interestType);
    const split = suggestInstallmentSplit({
      remainingPrincipal: pending,
      interestPercent,
      interestType,
      emiPi: monthlyEmiNum,
      gstPercent,
      totalMonths: a.totalMonths,
      startingBalance: starting,
    });
    const flatInterest = computeMonthlyInterest({
      startingBalance: starting,
      totalMonths: a.totalMonths,
      monthlyEmi: monthlyEmiNum,
    });
    const monthlyInterest =
      interestType === "reducing" ? split.interest : flatInterest;
    const monthlyPrincipal =
      interestType === "reducing"
        ? split.principal
        : Math.max(
            0,
            Math.round((monthlyEmiNum - flatInterest) * 100) / 100,
          );
    const monthlyGst =
      interestType === "reducing"
        ? split.gst
        : computeGstOnInterest(monthlyInterest, gstPercent);
    const monthlyToPay =
      Math.round((monthlyPrincipal + monthlyInterest + monthlyGst) * 100) /
      100;
    return {
      ...a,
      startingBalanceNum: starting,
      monthlyEmiNum,
      monthlyPrincipal,
      monthlyInterest,
      monthlyGst,
      monthlyToPay,
      totalPaid: paid,
      totalCharges: charges,
      paidTillNow: paidToDateByAccount.get(a.id) ?? 0,
      pending,
      nextDueDate: nextUnpaidDueByAccount.get(a.id) ?? null,
    };
  });

  // Owes something first; then soonest unpaid due; paid-off last.
  accountRows.sort((a, b) => {
    const aOwes = a.pending > 0 || !!a.nextDueDate;
    const bOwes = b.pending > 0 || !!b.nextDueDate;
    if (aOwes !== bOwes) return aOwes ? -1 : 1;
    const aDue = a.nextDueDate;
    const bDue = b.nextDueDate;
    if (aDue && bDue && aDue !== bDue) return aDue < bDue ? -1 : 1;
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    if (a.pending > 0 !== b.pending > 0) return a.pending > 0 ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const totals = accountRows.reduce(
    (acc, a) => ({
      starting: acc.starting + a.startingBalanceNum,
      paid: acc.paid + a.totalPaid,
      pending: acc.pending + a.pending,
    }),
    { starting: 0, paid: 0, pending: 0 },
  );

  const paymentsByMonth: Record<string, number> = {};
  for (const p of payments) {
    if (!p.isPaid) continue;
    const effect = paymentBalanceEffect(p.paymentType);
    if (effect !== "paydown") continue;
    const ym = yearMonthFromDate(p.dueDate);
    paymentsByMonth[ym] = (paymentsByMonth[ym] ?? 0) + toNumber(p.amount);
  }

  // Unpaid soonest-first, then paid (newest due first).
  const sortedPayments = [...payments].sort((a, b) => {
    if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
    if (a.dueDate !== b.dueDate) {
      return a.isPaid
        ? a.dueDate > b.dueDate
          ? -1
          : 1
        : a.dueDate < b.dueDate
          ? -1
          : 1;
    }
    return a.accountName.localeCompare(b.accountName);
  });

  return {
    accounts: accountRows,
    payments: sortedPayments,
    settings,
    totals,
    paymentsByMonth,
  };
}

export async function getDebtAccountDetail(userId: string, accountId: string) {
  const data = await getDebtDashboard(userId);
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) return null;

  const payments = data.payments.filter((p) => p.accountId === accountId);
  const monthsLeft = Math.max(0, account.totalMonths - account.monthsPaid);
  const interestPercentNum = toNumber(account.interestPercent);
  const gstPercentNum =
    account.gstPercent != null
      ? toNumber(account.gstPercent)
      : DEFAULT_GST_ON_INTEREST_PERCENT;
  const interestType = normalizeInterestType(account.interestType);
  const installment = suggestInstallmentSplit({
    remainingPrincipal: account.pending,
    interestPercent: interestPercentNum,
    interestType,
    emiPi: account.monthlyEmiNum,
    gstPercent: gstPercentNum,
    totalMonths: account.totalMonths,
    startingBalance: account.startingBalanceNum,
  });
  const flatMonthlyInterest = computeMonthlyInterest({
    startingBalance: account.startingBalanceNum,
    totalMonths: account.totalMonths,
    monthlyEmi: account.monthlyEmiNum,
  });
  const monthlyInterest =
    interestType === "reducing" ? installment.interest : flatMonthlyInterest;
  const monthlyPrincipal =
    interestType === "reducing"
      ? installment.principal
      : Math.max(
          0,
          Math.round((account.monthlyEmiNum - flatMonthlyInterest) * 100) / 100,
        );
  const monthlyGst =
    interestType === "reducing"
      ? installment.gst
      : computeGstOnInterest(monthlyInterest, gstPercentNum);
  const monthlyToPay =
    Math.round((monthlyPrincipal + monthlyInterest + monthlyGst) * 100) / 100;
  const totalInterest = computeTotalInterest({
    startingBalance: account.startingBalanceNum,
    totalMonths: account.totalMonths,
    monthlyEmi: account.monthlyEmiNum,
  });

  let creditCardName: string | null = null;
  if (account.creditCardId) {
    const [card] = await db
      .select({ name: creditCards.name })
      .from(creditCards)
      .where(
        and(
          eq(creditCards.id, account.creditCardId),
          eq(creditCards.userId, userId),
        ),
      )
      .limit(1);
    creditCardName = card?.name ?? null;
  }

  return {
    account: {
      ...account,
      interestPercentNum,
      gstPercentNum,
      monthsLeft,
      monthlyPrincipal,
      monthlyInterest,
      monthlyGst,
      monthlyToPay,
      totalInterest,
      creditCardName,
    },
    payments,
  };
}
