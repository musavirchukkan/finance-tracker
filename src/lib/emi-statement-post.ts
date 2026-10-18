import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cardActivities,
  creditCards,
  debtAccounts,
  debtPayments,
} from "@/lib/db/schema";
import { adjustCardOutstanding } from "@/lib/credit-card-cashflow";
import {
  dueDateFromBill,
  previousCycleDate,
} from "@/lib/credit-cards";
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

/**
 * True when an EMI was recorded after that statement’s payment due —
 * i.e. a backfill, not a real bill-day post.
 */
export function isPrematureEmiPost(args: {
  billDate: string;
  paymentDueGapDays: number | null | undefined;
  recordedOn: string;
}): boolean {
  const cycleDue = dueDateFromBill(args.billDate, args.paymentDueGapDays);
  if (!cycleDue) return false;
  return args.recordedOn > cycleDue;
}

/** Post only on/after bill date and on/before that cycle’s payment due. */
export function canPostEmiForCycle(args: {
  billDate: string;
  paymentDueGapDays: number | null | undefined;
  todayKey: string;
}): boolean {
  if (args.todayKey < args.billDate) return false;
  const cycleDue = dueDateFromBill(args.billDate, args.paymentDueGapDays);
  if (cycleDue && args.todayKey > cycleDue) return false;
  return true;
}

/**
 * Auto-post on page load only when the card already existed on bill day.
 * Mid-cycle adds (card created after the statement date) must use the
 * explicit “EMI already in outstanding / add now” choice on the debt form.
 */
export function shouldAutoPostEmiForCard(args: {
  cardCreatedAt: Date | string;
  lastBillDate: string;
}): boolean {
  const created =
    args.cardCreatedAt instanceof Date
      ? args.cardCreatedAt
      : new Date(args.cardCreatedAt);
  if (Number.isNaN(created.getTime())) return false;
  return toDateKey(created) <= args.lastBillDate;
}

/** User choice when linking / saving a CC EMI mid-cycle. */
export type EmiOutstandingChoice = "wait" | "already" | "add";

export function parseEmiOutstandingChoice(
  raw: FormDataEntryValue | string | null | undefined,
): EmiOutstandingChoice {
  const v = String(raw ?? "wait").trim().toLowerCase();
  if (v === "already" || v === "already_in_outstanding") return "already";
  if (v === "add" || v === "add_to_outstanding") return "add";
  return "wait";
}

export type EmiApplyMode = "add_to_outstanding" | "already_in_outstanding";

export function emiApplyModeFromChoice(
  choice: EmiOutstandingChoice,
): EmiApplyMode | null {
  if (choice === "already") return "already_in_outstanding";
  if (choice === "add") return "add_to_outstanding";
  return null;
}

export type LedgerWarning = {
  kind: "unpaid" | "overdue";
  severity: "warn" | "urgent";
  message: string;
  href?: string;
};

/** Card bill still unpaid; urgent when due date was 2+ days ago.
 *  Only when the user included the bank bill (statement amount / pin). */
export function cardBillWarnings(
  cards: {
    id: string;
    label: string;
    amountDue: number;
    nextDueDate: string | null;
    /** False/undefined = no statement included yet → no overdue nag. */
    billIncluded?: boolean;
  }[],
  today: Date = new Date(),
): LedgerWarning[] {
  const todayKey = toDateKey(startOfDay(today));
  const out: LedgerWarning[] = [];
  for (const c of cards) {
    if (c.billIncluded === false) continue;
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

async function reverseEmiPost(args: {
  userId: string;
  paymentId: string;
  accountId: string;
  cardId: string;
  billDate: string;
  amount: number;
  monthsPaid: number;
}) {
  const activities = await db
    .select()
    .from(cardActivities)
    .where(
      and(
        eq(cardActivities.userId, args.userId),
        eq(cardActivities.cardId, args.cardId),
        eq(cardActivities.activityType, "emi_posted"),
        eq(cardActivities.date, args.billDate),
      ),
    );

  let outstandingDelta = args.amount;
  let matchedActivityId: string | null = null;
  for (const a of activities) {
    if (Math.abs(toNumber(a.amount) - args.amount) < 0.02) {
      outstandingDelta = toNumber(a.outstandingDelta);
      matchedActivityId = a.id;
      break;
    }
  }

  // Unlock-only posts used delta 0 — do not touch card outstanding.
  if (outstandingDelta) {
    await adjustCardOutstanding(args.userId, args.cardId, -outstandingDelta);
  }

  if (matchedActivityId) {
    await db
      .delete(cardActivities)
      .where(
        and(
          eq(cardActivities.id, matchedActivityId),
          eq(cardActivities.userId, args.userId),
        ),
      );
  }

  await db
    .delete(debtPayments)
    .where(
      and(
        eq(debtPayments.id, args.paymentId),
        eq(debtPayments.userId, args.userId),
      ),
    );

  if (args.monthsPaid > 0) {
    await db
      .update(debtAccounts)
      .set({ monthsPaid: args.monthsPaid - 1 })
      .where(
        and(
          eq(debtAccounts.id, args.accountId),
          eq(debtAccounts.userId, args.userId),
        ),
      );
  }
}

/**
 * Apply one installment for a linked CC EMI on a statement date.
 * - add_to_outstanding: bank-style post (outstanding ↑, principal unlocks)
 * - already_in_outstanding: mid-cycle — outstanding already has EMI; unlock only
 */
export async function applyLinkedEmiForCycle(args: {
  userId: string;
  debtId: string;
  mode: EmiApplyMode;
  /** Defaults to the card’s last closed bill date. */
  billDate?: string;
  today?: Date;
}): Promise<{ applied: boolean; reason?: string }> {
  const today = args.today ?? new Date();
  const [debt] = await db
    .select()
    .from(debtAccounts)
    .where(
      and(
        eq(debtAccounts.id, args.debtId),
        eq(debtAccounts.userId, args.userId),
      ),
    )
    .limit(1);
  if (!debt?.creditCardId || !isCreditCardEmiType(debt.type)) {
    return { applied: false, reason: "not_cc_emi" };
  }

  const [card] = await db
    .select()
    .from(creditCards)
    .where(
      and(
        eq(creditCards.id, debt.creditCardId),
        eq(creditCards.userId, args.userId),
      ),
    )
    .limit(1);
  if (!card || card.billingDay == null) {
    return { applied: false, reason: "no_billing_day" };
  }

  const billDate =
    args.billDate ?? previousCycleDate(card.billingDay, today);
  if (!billDate) return { applied: false, reason: "no_bill_date" };

  const payments = await db
    .select()
    .from(debtPayments)
    .where(
      and(
        eq(debtPayments.userId, args.userId),
        eq(debtPayments.accountId, debt.id),
      ),
    );

  if (
    emiPostedForBillDate(
      payments.map((p) => ({
        accountId: p.accountId,
        paymentType: p.paymentType,
        dueDate: p.dueDate,
        isPaid: p.isPaid,
      })),
      debt.id,
      billDate,
    )
  ) {
    return { applied: false, reason: "already_posted" };
  }

  const remaining = computeOutstanding({
    startingBalance: toNumber(debt.startingBalance),
    payments: payments.map((p) => ({
      amount: toNumber(p.amount),
      isPaid: p.isPaid,
      paymentType: p.paymentType,
      principalAmount:
        p.principalAmount != null ? toNumber(p.principalAmount) : null,
    })),
  });
  if (remaining <= 0) return { applied: false, reason: "paid_off" };
  if (debt.totalMonths > 0 && debt.monthsPaid >= debt.totalMonths) {
    return { applied: false, reason: "tenure_done" };
  }

  const split = suggestInstallmentSplit({
    remainingPrincipal: remaining,
    interestPercent: toNumber(debt.interestPercent),
    interestType: debt.interestType,
    emiPi: toNumber(debt.monthlyEmi),
    gstPercent: toNumber(debt.gstPercent),
    totalMonths: debt.totalMonths,
    startingBalance: toNumber(debt.startingBalance),
  });
  if (split.total <= 0) return { applied: false, reason: "zero_emi" };

  const addToOutstanding = args.mode === "add_to_outstanding";
  const outstandingDelta = addToOutstanding ? split.total : 0;

  await db.insert(debtPayments).values({
    userId: args.userId,
    accountId: debt.id,
    dueDate: billDate,
    paymentType: EMI_POSTED_TO_CARD_TYPE,
    amount: split.total.toFixed(2),
    principalAmount: split.principal.toFixed(2),
    interestAmount: split.interest.toFixed(2),
    gstAmount: split.gst.toFixed(2),
    isPaid: true,
  });

  await db
    .update(debtAccounts)
    .set({ monthsPaid: debt.monthsPaid + 1 })
    .where(
      and(
        eq(debtAccounts.id, debt.id),
        eq(debtAccounts.userId, args.userId),
      ),
    );

  const desc =
    (addToOutstanding
      ? `EMI posted — ${debt.name}`
      : `EMI already in outstanding — ${debt.name}`) +
    ` (P ₹${split.principal.toFixed(0)}` +
    ` + I ₹${split.interest.toFixed(0)}` +
    ` + GST ₹${split.gst.toFixed(0)})`;

  await db.insert(cardActivities).values({
    userId: args.userId,
    cardId: card.id,
    date: billDate,
    activityType: "emi_posted",
    amount: split.total.toFixed(2),
    outstandingDelta: outstandingDelta.toFixed(2),
    description: desc,
  });

  if (outstandingDelta) {
    await adjustCardOutstanding(args.userId, card.id, outstandingDelta);
  }

  return { applied: true };
}

/**
 * Undo EMI rows that were backfilled after the statement’s payment due
 * (they should not have hit outstanding yet).
 */
export async function reversePrematureEmiPosts(
  userId: string,
): Promise<{ reversed: number }> {
  const cards = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.userId, userId));
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const accounts = await db
    .select()
    .from(debtAccounts)
    .where(eq(debtAccounts.userId, userId));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const payments = await db
    .select()
    .from(debtPayments)
    .where(eq(debtPayments.userId, userId));

  let reversed = 0;
  for (const p of payments) {
    if (!isEmiPostedToCardType(p.paymentType) || !p.isPaid) continue;
    const debt = accountById.get(p.accountId);
    if (!debt?.creditCardId) continue;
    const card = cardById.get(debt.creditCardId);
    if (!card) continue;

    const recordedOn = toDateKey(
      p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt),
    );
    if (
      !isPrematureEmiPost({
        billDate: p.dueDate,
        paymentDueGapDays: card.paymentDueGapDays,
        recordedOn,
      })
    ) {
      continue;
    }

    await reverseEmiPost({
      userId,
      paymentId: p.id,
      accountId: debt.id,
      cardId: card.id,
      billDate: p.dueDate,
      amount: toNumber(p.amount),
      monthsPaid: debt.monthsPaid,
    });
    debt.monthsPaid = Math.max(0, debt.monthsPaid - 1);
    reversed += 1;
  }

  return { reversed };
}

/**
 * For each linked CC EMI on a card that existed on bill day: when the
 * statement date has arrived and payment due is still ahead, post P+I+GST
 * onto outstanding and unlock principal.
 *
 * Cards added mid-cycle are skipped — use the debt-form EMI outstanding choice.
 * Also strips premature backfills that landed EMI on outstanding too early.
 */
export async function postLinkedEmisForUser(
  userId: string,
  today: Date = new Date(),
): Promise<{ posted: number; reversed: number }> {
  const { reversed } = await reversePrematureEmiPosts(userId);

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
  if (ccEmi.length === 0) return { posted: 0, reversed };

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const todayKey = toDateKey(startOfDay(today));
  let posted = 0;

  for (const debt of ccEmi) {
    const card = cardById.get(debt.creditCardId!);
    if (!card || card.billingDay == null) continue;

    const lastBillDate = previousCycleDate(card.billingDay, today);
    if (!lastBillDate) continue;

    if (
      !shouldAutoPostEmiForCard({
        cardCreatedAt: card.createdAt,
        lastBillDate,
      })
    ) {
      continue;
    }

    if (
      !canPostEmiForCycle({
        billDate: lastBillDate,
        paymentDueGapDays: card.paymentDueGapDays,
        todayKey,
      })
    ) {
      continue;
    }

    const result = await applyLinkedEmiForCycle({
      userId,
      debtId: debt.id,
      mode: "add_to_outstanding",
      billDate: lastBillDate,
      today,
    });
    if (result.applied) posted += 1;
  }

  return { posted, reversed };
}
