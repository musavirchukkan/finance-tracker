import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cardActivities,
  creditCards,
  debtAccounts,
  debtPayments,
} from "@/lib/db/schema";
import { adjustCardOutstanding } from "@/lib/credit-card-cashflow";
import { previousCycleDate } from "@/lib/credit-cards";
import {
  EMI_POSTED_TO_CARD_TYPE,
  isEmiPostedToCardType,
  suggestInstallmentSplit,
} from "@/lib/debt-account";
import { computeOutstanding, isCreditCardEmiType } from "@/lib/debt-kinds";
import { toNumber } from "@/lib/money";

function toDateKey(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Calendar days from `fromKey` to `toKey` (YYYY-MM-DD). Positive if to > from. */
export function calendarDaysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  const a = new Date(fy, fm - 1, fd, 12, 0, 0, 0);
  const b = new Date(ty, tm - 1, td, 12, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function emiPostedForBillDate(
  payments: {
    accountId: string;
    paymentType: string;
    dueDate: string;
    isPaid?: boolean;
  }[],
  debtId: string,
  billDate: string,
): boolean {
  return payments.some(
    (p) =>
      p.accountId === debtId &&
      isEmiPostedToCardType(p.paymentType) &&
      p.dueDate === billDate &&
      (p.isPaid == null || p.isPaid),
  );
}

export type LedgerWarning = {
  kind: "unpaid" | "overdue";
  severity: "warn" | "urgent";
  message: string;
  href?: string;
};

/** Card bill still unpaid; urgent when due date was 2+ days ago. */
export function cardBillWarnings(
  cards: {
    id: string;
    label: string;
    amountDue: number;
    nextDueDate: string | null;
  }[],
  today: Date = new Date(),
): LedgerWarning[] {
  const todayKey = toDateKey(startOfDay(today));
  const out: LedgerWarning[] = [];
  for (const c of cards) {
    if (c.amountDue <= 0 || !c.nextDueDate) continue;
    const daysPast = calendarDaysBetween(c.nextDueDate, todayKey);
    if (daysPast >= 2) {
      out.push({
        kind: "overdue",
        severity: "urgent",
        message: `${c.label}: ₹${c.amountDue.toFixed(0)} was due ${c.nextDueDate} (${daysPast} days ago) — pay the bill`,
        href: `/cards/${c.id}`,
      });
    } else if (daysPast >= 0) {
      out.push({
        kind: "unpaid",
        severity: "warn",
        message: `${c.label}: ₹${c.amountDue.toFixed(0)} due ${c.nextDueDate} — not marked paid yet`,
        href: `/cards/${c.id}`,
      });
    }
  }
  return out;
}

/** Unpaid debt payment rows (manual EMI etc.) due today or earlier. */
export function unpaidDebtPaymentWarnings(
  payments: {
    id: string;
    accountId: string;
    accountName: string;
    dueDate: string;
    paymentType: string;
    amount: number | string;
    isPaid: boolean;
  }[],
  today: Date = new Date(),
): LedgerWarning[] {
  const todayKey = toDateKey(startOfDay(today));
  const out: LedgerWarning[] = [];
  for (const p of payments) {
    if (p.isPaid) continue;
    if (isEmiPostedToCardType(p.paymentType)) continue;
    if (p.dueDate > todayKey) continue;
    const amount = toNumber(String(p.amount));
    const daysPast = calendarDaysBetween(p.dueDate, todayKey);
    if (daysPast >= 2) {
      out.push({
        kind: "overdue",
        severity: "urgent",
        message: `${p.accountName}: ${p.paymentType} ₹${amount.toFixed(0)} was due ${p.dueDate} (${daysPast} days ago)`,
        href: `/debt/${p.accountId}`,
      });
    } else {
      out.push({
        kind: "unpaid",
        severity: "warn",
        message: `${p.accountName}: ${p.paymentType} ₹${amount.toFixed(0)} due ${p.dueDate} — not marked paid`,
        href: `/debt/${p.accountId}`,
      });
    }
  }
  return out;
}

/**
 * For each linked CC EMI, if the card’s latest statement date has passed and
 * this cycle was not posted yet: add P+I+GST to card outstanding, unlock
 * principal on the debt, bump monthsPaid, and log an emi_posted activity.
 */
export async function postLinkedEmisForUser(
  userId: string,
  today: Date = new Date(),
): Promise<{ posted: number }> {
  const cards = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.userId, userId));

  const accounts = await db
    .select()
    .from(debtAccounts)
    .where(eq(debtAccounts.userId, userId));

  const ccEmi = accounts.filter(
    (a) => a.creditCardId && isCreditCardEmiType(a.type),
  );
  if (ccEmi.length === 0) return { posted: 0 };

  const payments = await db
    .select()
    .from(debtPayments)
    .where(eq(debtPayments.userId, userId));

  const paymentsByAccount = new Map<string, typeof payments>();
  for (const p of payments) {
    const list = paymentsByAccount.get(p.accountId) ?? [];
    list.push(p);
    paymentsByAccount.set(p.accountId, list);
  }

  const cardById = new Map(cards.map((c) => [c.id, c]));
  let posted = 0;

  for (const debt of ccEmi) {
    const card = cardById.get(debt.creditCardId!);
    if (!card || card.billingDay == null) continue;

    const lastBillDate = previousCycleDate(card.billingDay, today);
    if (!lastBillDate) continue;

    if (
      emiPostedForBillDate(
        payments.map((p) => ({
          accountId: p.accountId,
          paymentType: p.paymentType,
          dueDate: p.dueDate,
          isPaid: p.isPaid,
        })),
        debt.id,
        lastBillDate,
      )
    ) {
      continue;
    }

    const accountPays = paymentsByAccount.get(debt.id) ?? [];
    const remaining = computeOutstanding({
      startingBalance: toNumber(debt.startingBalance),
      payments: accountPays.map((p) => ({
        amount: toNumber(p.amount),
        isPaid: p.isPaid,
        paymentType: p.paymentType,
        principalAmount:
          p.principalAmount != null ? toNumber(p.principalAmount) : null,
      })),
    });
    if (remaining <= 0) continue;

    if (
      debt.totalMonths > 0 &&
      debt.monthsPaid >= debt.totalMonths
    ) {
      continue;
    }

    const emiPi = toNumber(debt.monthlyEmi);
    const split = suggestInstallmentSplit({
      remainingPrincipal: remaining,
      interestPercent: toNumber(debt.interestPercent),
      interestType: debt.interestType,
      emiPi,
      gstPercent: toNumber(debt.gstPercent),
      totalMonths: debt.totalMonths,
      startingBalance: toNumber(debt.startingBalance),
    });
    if (split.total <= 0) continue;

    const [payRow] = await db
      .insert(debtPayments)
      .values({
        userId,
        accountId: debt.id,
        dueDate: lastBillDate,
        paymentType: EMI_POSTED_TO_CARD_TYPE,
        amount: split.total.toFixed(2),
        principalAmount: split.principal.toFixed(2),
        interestAmount: split.interest.toFixed(2),
        gstAmount: split.gst.toFixed(2),
        isPaid: true,
      })
      .returning();

    // Keep local list in sync for idempotency within this run.
    if (payRow) {
      payments.push(payRow);
      accountPays.push(payRow);
      paymentsByAccount.set(debt.id, accountPays);
    }

    await db
      .update(debtAccounts)
      .set({ monthsPaid: debt.monthsPaid + 1 })
      .where(
        and(eq(debtAccounts.id, debt.id), eq(debtAccounts.userId, userId)),
      );
    debt.monthsPaid += 1;

    const desc =
      `EMI posted — ${debt.name}` +
      ` (P ₹${split.principal.toFixed(0)}` +
      ` + I ₹${split.interest.toFixed(0)}` +
      ` + GST ₹${split.gst.toFixed(0)})`;

    await db.insert(cardActivities).values({
      userId,
      cardId: card.id,
      date: lastBillDate,
      activityType: "emi_posted",
      amount: split.total.toFixed(2),
      outstandingDelta: split.total.toFixed(2),
      description: desc,
    });
    await adjustCardOutstanding(userId, card.id, split.total);
    posted += 1;
  }

  return { posted };
}
