import { and, asc, desc, eq, gte } from "drizzle-orm";
import { cache } from "react";
import { cacheGetOrSetJson } from "@/lib/cache";
import { CARD_ACTIVITY_LOOKBACK_DAYS } from "@/lib/constants";
import { db } from "@/lib/db";
import {
  cardActivities,
  creditCards,
  debtAccounts,
  debtPayments,
} from "@/lib/db/schema";
import {
  availableCreditForSharedLimit,
  formatCardLabel,
  isActiveCardStatus,
  previousCycleDate,
  resolveLimitRootId,
  sharedLimitMemberIds,
  summarizeCardStatement,
  totalDueThisCycle,
} from "@/lib/credit-cards";
import { REF_CACHE_TTL_SEC, RefCacheKeys } from "@/lib/ref-cache";
import {
  computeOutstanding,
  isCreditCardEmiType,
} from "@/lib/debt-kinds";
import { suggestInstallmentSplit } from "@/lib/debt-account";
import {
  cardBillWarnings,
  emiPostedForBillDate,
  unpaidDebtPaymentWarnings,
  type LedgerWarning,
} from "@/lib/emi-statement-post";
import { toNumber } from "@/lib/money";

function statementFromActivities(
  card: {
    billingDay: number | null;
    paymentDueGapDays: number | null;
    currentOutstanding: string;
    statementAmount?: string | null;
    pinToCurrentStatement?: boolean | null;
  },
  activities: { date: string; activityType: string; outstandingDelta: string }[],
) {
  const outstanding = toNumber(card.currentOutstanding);
  const summary = summarizeCardStatement({
    billingDay: card.billingDay,
    paymentDueGapDays: card.paymentDueGapDays,
    currentOutstanding: outstanding,
    statementAmount:
      card.statementAmount != null && card.statementAmount !== ""
        ? toNumber(card.statementAmount)
        : null,
    pinToCurrentStatement: !!card.pinToCurrentStatement,
    activities: activities.map((a) => ({
      date: a.date,
      activityType: a.activityType,
      outstandingDelta: toNumber(a.outstandingDelta),
    })),
  });

  // No billing day → treat full outstanding as due.
  if (card.billingDay == null) {
    return {
      ...summary,
      amountDue: outstanding,
      nextBillPending: 0,
    };
  }
  return summary;
}

type LinkedEmiBucket = {
  emiBlocked: number;
  /** Installment total (P+I+GST) for display this cycle. */
  emiMonthly: number;
  /**
   * Amount still to add on top of statement due. Zero when this cycle’s EMI
   * was already posted onto card outstanding (avoid double-count).
   */
  emiForDue: number;
  emis: {
    id: string;
    name: string;
    monthlyEmi: number;
    remaining: number;
    postedThisCycle: boolean;
  }[];
};

async function linkedEmiByCard(
  userId: string,
  lastBillByCard: Map<string, string | null>,
) {
  const accounts = await db
    .select()
    .from(debtAccounts)
    .where(eq(debtAccounts.userId, userId));

  const ccEmiAccounts = accounts.filter(
    (a) => a.creditCardId && isCreditCardEmiType(a.type),
  );
  if (ccEmiAccounts.length === 0) {
    return new Map<string, LinkedEmiBucket>();
  }

  const payments = await db
    .select()
    .from(debtPayments)
    .where(eq(debtPayments.userId, userId));

  const paymentMeta = payments.map((p) => ({
    accountId: p.accountId,
    paymentType: p.paymentType,
    dueDate: p.dueDate,
    isPaid: p.isPaid,
  }));

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
    const list = paymentsByAccount.get(p.accountId) ?? [];
    list.push({
      amount: toNumber(p.amount),
      isPaid: p.isPaid,
      paymentType: p.paymentType,
      principalAmount:
        p.principalAmount != null ? toNumber(p.principalAmount) : null,
    });
    paymentsByAccount.set(p.accountId, list);
  }

  const byCard = new Map<string, LinkedEmiBucket>();

  for (const a of ccEmiAccounts) {
    const cardId = a.creditCardId!;
    const remaining = computeOutstanding({
      startingBalance: toNumber(a.startingBalance),
      payments: paymentsByAccount.get(a.id) ?? [],
    });
    const emiPi = toNumber(a.monthlyEmi);
    const lastBill = lastBillByCard.get(cardId) ?? null;
    const postedThisCycle =
      !!lastBill && emiPostedForBillDate(paymentMeta, a.id, lastBill);

    // Prefer the amount actually posted on this statement when present.
    let monthlyDue = 0;
    if (postedThisCycle && lastBill) {
      const postedPay = payments.find(
        (p) =>
          p.accountId === a.id &&
          p.dueDate === lastBill &&
          p.paymentType.toLowerCase() === "emi posted to card",
      );
      if (postedPay) monthlyDue = toNumber(postedPay.amount);
    }
    if (monthlyDue <= 0 && remaining > 0) {
      const split = suggestInstallmentSplit({
        remainingPrincipal: remaining,
        interestPercent: toNumber(a.interestPercent),
        interestType: a.interestType,
        emiPi,
        gstPercent: toNumber(a.gstPercent),
        totalMonths: a.totalMonths,
        startingBalance: toNumber(a.startingBalance),
      });
      monthlyDue = split.total > 0 ? split.total : emiPi;
    }

    const bucket = byCard.get(cardId) ?? {
      emiBlocked: 0,
      emiMonthly: 0,
      emiForDue: 0,
      emis: [],
    };
    if (remaining > 0 || postedThisCycle) {
      if (remaining > 0) bucket.emiBlocked += remaining;
      if (monthlyDue > 0) {
        bucket.emiMonthly += monthlyDue;
        // EMI hits due only after it posts onto the statement on bill date —
        // never add a display-only installment on top (avoids false overdue
        // before the statement day, e.g. Axis bill day 20).
      }
      bucket.emis.push({
        id: a.id,
        name: a.name,
        monthlyEmi: monthlyDue,
        remaining,
        postedThisCycle,
      });
    }
    byCard.set(cardId, bucket);
  }

  return byCard;
}

function withEmiAggregates(
  card: {
    id: string;
    name: string;
    currentOutstanding: string;
    creditLimit: string | null;
    sharesLimitWithId: string | null;
    billingDay: number | null;
    paymentDueGapDays: number | null;
  },
  summary: ReturnType<typeof statementFromActivities>,
  emi: LinkedEmiBucket | undefined,
  allCards: {
    id: string;
    name: string;
    lastFour: string | null;
    currentOutstanding: string;
    creditLimit: string | null;
    sharesLimitWithId: string | null;
  }[],
  emiByCard: Map<string, { emiBlocked: number }>,
) {
  const outstandingNum = toNumber(card.currentOutstanding);
  const emiBlockedNum = emi?.emiBlocked ?? 0;
  const emiMonthlyNum = emi?.emiMonthly ?? 0;
  const emiForDueNum = emi?.emiForDue ?? 0;
  const statementDueNum = summary.amountDue;

  const rootId = resolveLimitRootId(card.id, allCards);
  const root = allCards.find((c) => c.id === rootId) ?? card;
  const memberIds = sharedLimitMemberIds(card.id, allCards);
  const members = allCards.filter((c) => memberIds.includes(c.id));
  const sharedLimit =
    root.creditLimit != null ? toNumber(root.creditLimit) : null;
  // Shared-limit usage only counts positive revolving (prepaid stays per-card).
  const groupRevolving = members.reduce(
    (s, c) => s + Math.max(0, toNumber(c.currentOutstanding)),
    0,
  );
  const groupEmiBlocked = members.reduce(
    (s, c) => s + (emiByCard.get(c.id)?.emiBlocked ?? 0),
    0,
  );
  const sharedPeers = members
    .filter((c) => c.id !== card.id)
    .map((c) => formatCardLabel(c.name, c.lastFour));

  const emiBlockedMap = new Map(
    [...emiByCard.entries()].map(([id, v]) => [id, v.emiBlocked]),
  );

  const availableNum = availableCreditForSharedLimit({
    cardId: card.id,
    cards: allCards,
    emiBlockedByCard: emiBlockedMap,
  });
  const groupUsed = groupRevolving + groupEmiBlocked;
  const overLimitNum =
    sharedLimit != null
      ? Math.max(0, Math.round((groupUsed - sharedLimit) * 100) / 100)
      : 0;

  return {
    outstandingNum,
    /** Prepaid sitting on this card when outstanding is negative. */
    prepaidNum: outstandingNum < 0 ? -outstandingNum : 0,
    /** Limit shown for this card: own limit, or shared root limit. */
    creditLimitNum: sharedLimit,
    ownCreditLimitNum:
      card.creditLimit != null ? toNumber(card.creditLimit) : null,
    sharesLimitWithId: card.sharesLimitWithId,
    sharedLimitRootId: rootId,
    sharesLimit: memberIds.length > 1,
    sharedWithLabels: sharedPeers,
    groupRevolvingNum: groupRevolving,
    groupEmiBlockedNum: groupEmiBlocked,
    /** How far over the (shared) limit — 0 if within limit or no limit set. */
    overLimitNum,
    nextBillDate: summary.nextBillDate,
    nextDueDate: summary.nextDueDate,
    lastBillDate: summary.lastBillDate,
    statementDueNum,
    emiBlockedNum,
    emiMonthlyNum,
    emiForDueNum,
    amountDue: totalDueThisCycle({
      statementDue: statementDueNum,
      linkedMonthlyEmi: emiForDueNum,
    }),
    nextBillPending: summary.nextBillPending,
    availableNum,
    linkedEmis: emi?.emis ?? [],
  };
}

function activityLookbackDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - CARD_ACTIVITY_LOOKBACK_DAYS);
  return d.toISOString().slice(0, 10);
}

export type CreditCardOption = {
  id: string;
  name: string;
  lastFour: string | null;
  label: string;
  status: string;
  isRupay: boolean;
  showInPaymentPicker: boolean;
};

/** Dropdown-shaped cards (no outstanding / EMI). Redis when configured. */
export const listCreditCardOptions = cache(async (userId: string) => {
  return cacheGetOrSetJson<CreditCardOption[]>(
    RefCacheKeys.cardOptions(userId),
    REF_CACHE_TTL_SEC,
    async () => {
      const rows = await db
        .select({
          id: creditCards.id,
          name: creditCards.name,
          lastFour: creditCards.lastFour,
          status: creditCards.status,
          isRupay: creditCards.isRupay,
          showInPaymentPicker: creditCards.showInPaymentPicker,
        })
        .from(creditCards)
        .where(eq(creditCards.userId, userId))
        .orderBy(asc(creditCards.name));

      return rows.map((c) => ({
        ...c,
        label: formatCardLabel(c.name, c.lastFour),
      }));
    },
  );
});

/** Pure read — call `ensureCardLedgerSynced` first when EMI/migrate must run. */
export const listCreditCards = cache(async (userId: string) => {
  const rows = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.userId, userId))
    .orderBy(asc(creditCards.name));

  const cutoff = activityLookbackDate();
  const allActivities = await db
    .select({
      cardId: cardActivities.cardId,
      date: cardActivities.date,
      activityType: cardActivities.activityType,
      outstandingDelta: cardActivities.outstandingDelta,
    })
    .from(cardActivities)
    .where(
      and(
        eq(cardActivities.userId, userId),
        gte(cardActivities.date, cutoff),
      ),
    );

  const byCard = new Map<string, typeof allActivities>();
  for (const a of allActivities) {
    const list = byCard.get(a.cardId) ?? [];
    list.push(a);
    byCard.set(a.cardId, list);
  }

  const lastBillByCard = new Map<string, string | null>();
  for (const c of rows) {
    const summary = statementFromActivities(c, byCard.get(c.id) ?? []);
    lastBillByCard.set(c.id, summary.lastBillDate);
  }

  const emiByCard = await linkedEmiByCard(userId, lastBillByCard);

  const listed = rows.map((c) => {
    const summary = statementFromActivities(c, byCard.get(c.id) ?? []);
    return {
      ...c,
      label: formatCardLabel(c.name, c.lastFour),
      ...withEmiAggregates(c, summary, emiByCard.get(c.id), rows, emiByCard),
    };
  });

  // Active first; anything to pay before ₹0 due; then soonest due; inactive last.
  listed.sort((a, b) => {
    const aActive = isActiveCardStatus(a.status);
    const bActive = isActiveCardStatus(b.status);
    if (aActive !== bActive) return aActive ? -1 : 1;
    const aOwes = a.amountDue > 0;
    const bOwes = b.amountDue > 0;
    if (aOwes !== bOwes) return aOwes ? -1 : 1;
    const aDue = a.nextDueDate;
    const bDue = b.nextDueDate;
    if (aDue && bDue && aDue !== bDue) return aDue < bDue ? -1 : 1;
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    return a.label.localeCompare(b.label);
  });

  return listed;
});

/** Payment / bill reminders for Cards + Debt pages. */
export async function listLedgerPaymentWarnings(
  userId: string,
  cards?: Awaited<ReturnType<typeof listCreditCards>>,
): Promise<LedgerWarning[]> {
  const cardRows = cards ?? (await listCreditCards(userId));
  const bill = cardBillWarnings(
    cardRows.map((c) => ({
      id: c.id,
      label: c.label,
      amountDue: c.amountDue,
      nextDueDate: c.nextDueDate,
      billIncluded:
        !!c.pinToCurrentStatement ||
        (c.statementAmount != null && toNumber(c.statementAmount) > 0),
    })),
  );

  const debtPays = await db
    .select({
      id: debtPayments.id,
      accountId: debtPayments.accountId,
      accountName: debtAccounts.name,
      dueDate: debtPayments.dueDate,
      paymentType: debtPayments.paymentType,
      amount: debtPayments.amount,
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
    .where(eq(debtPayments.userId, userId));

  const unpaid = unpaidDebtPaymentWarnings(debtPays);
  return [...bill, ...unpaid];
}

/** Pure read — call `ensureCardLedgerSynced` first when EMI/migrate must run. */
export async function getCreditCardDetail(userId: string, cardId: string) {
  const allCards = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.userId, userId));
  const card = allCards.find((c) => c.id === cardId);
  if (!card) return null;

  const cutoff = activityLookbackDate();
  const activities = await db
    .select()
    .from(cardActivities)
    .where(
      and(
        eq(cardActivities.cardId, cardId),
        eq(cardActivities.userId, userId),
        gte(cardActivities.date, cutoff),
      ),
    )
    .orderBy(desc(cardActivities.date), desc(cardActivities.createdAt));

  const summary = statementFromActivities(card, activities);
  const lastBillByCard = new Map<string, string | null>();
  for (const c of allCards) {
    lastBillByCard.set(
      c.id,
      c.id === cardId
        ? summary.lastBillDate
        : previousCycleDate(c.billingDay),
    );
  }
  const emiByCard = await linkedEmiByCard(userId, lastBillByCard);
  const emi = emiByCard.get(cardId);

  const cardRow = {
    ...card,
    label: formatCardLabel(card.name, card.lastFour),
    ...withEmiAggregates(card, summary, emi, allCards, emiByCard),
  };

  return {
    card: cardRow,
    /** Share-limit peers from the same allCards load (avoids a second list query). */
    shareOptions: allCards
      .filter((c) => !c.sharesLimitWithId && c.id !== cardId)
      .map((c) => ({
        id: c.id,
        label: formatCardLabel(c.name, c.lastFour),
        creditLimit:
          c.creditLimit != null && c.creditLimit !== ""
            ? toNumber(c.creditLimit)
            : null,
      })),
    warnings: cardBillWarnings([
      {
        id: cardRow.id,
        label: cardRow.label,
        amountDue: cardRow.amountDue,
        nextDueDate: cardRow.nextDueDate,
        billIncluded:
          !!card.pinToCurrentStatement ||
          (card.statementAmount != null &&
            toNumber(card.statementAmount) > 0),
      },
    ]),
    activities: activities.map((a) => ({
      ...a,
      amountNum: toNumber(a.amount),
      outstandingDeltaNum: toNumber(a.outstandingDelta),
      walletCreditNum:
        a.walletCredit != null ? toNumber(a.walletCredit) : null,
      cardChargedNum: a.cardCharged != null ? toNumber(a.cardCharged) : null,
      bankFeeNum: a.bankFee != null ? toNumber(a.bankFee) : null,
    })),
  };
}
