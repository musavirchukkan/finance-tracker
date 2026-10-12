"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  cardActivities,
  creditCards,
  debtAccounts,
  debtPayments,
  transactions,
} from "@/lib/db/schema";
import {
  adjustCardOutstanding,
  deleteLinkedCashflowTx,
  ensureCardCashflowCategories,
} from "@/lib/credit-card-cashflow";
import {
  availableCreditForSharedLimit,
  clampBillingDay,
  formatCardLabel,
  normalizeLastFour,
  resolveLimitRootId,
  sharedLimitMemberIds,
  summarizeCardStatement,
  totalDueThisCycle,
} from "@/lib/credit-cards";
import {
  computeOutstanding,
  isCreditCardEmiType,
  isCreditCardType,
} from "@/lib/debt-kinds";
import { parseAmount, toNumber } from "@/lib/money";
import { requireUser } from "@/lib/session";

function revalidateCards(cardId?: string) {
  revalidatePath("/cards");
  if (cardId) revalidatePath(`/cards/${cardId}`);
  revalidatePath("/transactions");
  revalidatePath("/overview");
  revalidatePath("/budget");
  revalidatePath("/debt");
  revalidatePath("/quick-add");
}

/** Move legacy rolling Credit Card debt accounts into credit_cards. */
export async function migrateRollingCreditCards(userId: string) {
  const debtRows = await db
    .select()
    .from(debtAccounts)
    .where(eq(debtAccounts.userId, userId));

  const rolling = debtRows.filter((a) => isCreditCardType(a.type));
  if (rolling.length === 0) return { migrated: 0 };

  const payments = await db
    .select()
    .from(debtPayments)
    .where(eq(debtPayments.userId, userId));

  let migrated = 0;
  for (const account of rolling) {
    const accountPayments = payments.filter((p) => p.accountId === account.id);
    const outstanding = computeOutstanding({
      startingBalance: toNumber(account.startingBalance),
      payments: accountPayments.map((p) => ({
        amount: toNumber(p.amount),
        isPaid: p.isPaid,
        paymentType: p.paymentType,
      })),
    });

    const existing = await db
      .select({ id: creditCards.id })
      .from(creditCards)
      .where(
        and(eq(creditCards.userId, userId), eq(creditCards.name, account.name)),
      )
      .limit(1);

    if (!existing[0]) {
      await db.insert(creditCards).values({
        userId,
        name: account.name,
        currentOutstanding: outstanding.toFixed(2),
        status: account.status || "Active",
      });
      migrated += 1;
    }

    for (const p of accountPayments) {
      if (p.transactionId) {
        await db
          .update(debtPayments)
          .set({ transactionId: null })
          .where(eq(debtPayments.id, p.id));
      }
    }
    await db
      .delete(debtPayments)
      .where(
        and(
          eq(debtPayments.accountId, account.id),
          eq(debtPayments.userId, userId),
        ),
      );
    await db
      .update(debtAccounts)
      .set({ receivedTransactionId: null })
      .where(
        and(eq(debtAccounts.id, account.id), eq(debtAccounts.userId, userId)),
      );
    await db
      .delete(debtAccounts)
      .where(
        and(eq(debtAccounts.id, account.id), eq(debtAccounts.userId, userId)),
      );
  }

  if (migrated > 0) revalidateCards();
  return { migrated };
}

function statementFromActivities(
  card: {
    billingDay: number | null;
    paymentDueDay: number | null;
    currentOutstanding: string;
  },
  activities: { date: string; activityType: string; outstandingDelta: string }[],
) {
  const outstanding = toNumber(card.currentOutstanding);
  const summary = summarizeCardStatement({
    billingDay: card.billingDay,
    paymentDueDay: card.paymentDueDay,
    currentOutstanding: outstanding,
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

async function linkedEmiByCard(userId: string) {
  const accounts = await db
    .select()
    .from(debtAccounts)
    .where(eq(debtAccounts.userId, userId));

  const ccEmiAccounts = accounts.filter(
    (a) => a.creditCardId && isCreditCardEmiType(a.type),
  );
  if (ccEmiAccounts.length === 0) {
    return new Map<
      string,
      {
        emiBlocked: number;
        emiMonthly: number;
        emis: {
          id: string;
          name: string;
          monthlyEmi: number;
          remaining: number;
        }[];
      }
    >();
  }

  const payments = await db
    .select()
    .from(debtPayments)
    .where(eq(debtPayments.userId, userId));

  const paymentsByAccount = new Map<
    string,
    { amount: number; isPaid: boolean; paymentType: string }[]
  >();
  for (const p of payments) {
    const list = paymentsByAccount.get(p.accountId) ?? [];
    list.push({
      amount: toNumber(p.amount),
      isPaid: p.isPaid,
      paymentType: p.paymentType,
    });
    paymentsByAccount.set(p.accountId, list);
  }

  const byCard = new Map<
    string,
    {
      emiBlocked: number;
      emiMonthly: number;
      emis: {
        id: string;
        name: string;
        monthlyEmi: number;
        remaining: number;
      }[];
    }
  >();

  for (const a of ccEmiAccounts) {
    const cardId = a.creditCardId!;
    const remaining = computeOutstanding({
      startingBalance: toNumber(a.startingBalance),
      payments: paymentsByAccount.get(a.id) ?? [],
    });
    const monthly = toNumber(a.monthlyEmi);
    const bucket = byCard.get(cardId) ?? {
      emiBlocked: 0,
      emiMonthly: 0,
      emis: [],
    };
    if (remaining > 0) {
      bucket.emiBlocked += remaining;
      bucket.emiMonthly += monthly;
      bucket.emis.push({
        id: a.id,
        name: a.name,
        monthlyEmi: monthly,
        remaining,
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
    paymentDueDay: number | null;
  },
  summary: ReturnType<typeof statementFromActivities>,
  emi: {
    emiBlocked: number;
    emiMonthly: number;
    emis: {
      id: string;
      name: string;
      monthlyEmi: number;
      remaining: number;
    }[];
  } | undefined,
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
  const statementDueNum = summary.amountDue;

  const rootId = resolveLimitRootId(card.id, allCards);
  const root = allCards.find((c) => c.id === rootId) ?? card;
  const memberIds = sharedLimitMemberIds(card.id, allCards);
  const members = allCards.filter((c) => memberIds.includes(c.id));
  const sharedLimit =
    root.creditLimit != null ? toNumber(root.creditLimit) : null;
  const groupRevolving = members.reduce(
    (s, c) => s + toNumber(c.currentOutstanding),
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

  return {
    outstandingNum,
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
    nextBillDate: summary.nextBillDate,
    nextDueDate: summary.nextDueDate,
    lastBillDate: summary.lastBillDate,
    statementDueNum,
    emiBlockedNum,
    emiMonthlyNum,
    amountDue: totalDueThisCycle({
      statementDue: statementDueNum,
      linkedMonthlyEmi: emiMonthlyNum,
    }),
    nextBillPending: summary.nextBillPending,
    availableNum: availableCreditForSharedLimit({
      cardId: card.id,
      cards: allCards,
      emiBlockedByCard: emiBlockedMap,
    }),
    linkedEmis: emi?.emis ?? [],
  };
}

async function parseSharesLimitWithId(
  userId: string,
  cardId: string | null,
  formData: FormData,
) {
  const raw = String(formData.get("sharesLimitWithId") ?? "").trim();
  if (!raw) return null;
  if (cardId && raw === cardId) {
    throw new Error("A card cannot share limit with itself");
  }
  const [target] = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, raw), eq(creditCards.userId, userId)))
    .limit(1);
  if (!target) throw new Error("Shared-limit card not found");
  // Only link to a root card (one that doesn't itself share).
  if (target.sharesLimitWithId) {
    throw new Error("Pick the card that owns the shared limit");
  }
  return target.id;
}

export async function listCreditCards(userId: string) {
  await migrateRollingCreditCards(userId);
  const rows = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.userId, userId))
    .orderBy(asc(creditCards.name));

  const allActivities = await db
    .select({
      cardId: cardActivities.cardId,
      date: cardActivities.date,
      activityType: cardActivities.activityType,
      outstandingDelta: cardActivities.outstandingDelta,
    })
    .from(cardActivities)
    .where(eq(cardActivities.userId, userId));

  const byCard = new Map<string, typeof allActivities>();
  for (const a of allActivities) {
    const list = byCard.get(a.cardId) ?? [];
    list.push(a);
    byCard.set(a.cardId, list);
  }

  const emiByCard = await linkedEmiByCard(userId);

  return rows.map((c) => {
    const summary = statementFromActivities(c, byCard.get(c.id) ?? []);
    return {
      ...c,
      label: formatCardLabel(c.name, c.lastFour),
      ...withEmiAggregates(c, summary, emiByCard.get(c.id), rows, emiByCard),
    };
  });
}

export async function getCreditCardDetail(userId: string, cardId: string) {
  await migrateRollingCreditCards(userId);
  const allCards = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.userId, userId));
  const card = allCards.find((c) => c.id === cardId);
  if (!card) return null;

  const activities = await db
    .select()
    .from(cardActivities)
    .where(
      and(eq(cardActivities.cardId, cardId), eq(cardActivities.userId, userId)),
    )
    .orderBy(desc(cardActivities.date), desc(cardActivities.createdAt));

  const summary = statementFromActivities(card, activities);
  const emiByCard = await linkedEmiByCard(userId);
  const emi = emiByCard.get(cardId);

  return {
    card: {
      ...card,
      label: formatCardLabel(card.name, card.lastFour),
      ...withEmiAggregates(card, summary, emi, allCards, emiByCard),
    },
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

function parseCardExtra(formData: FormData) {
  const lastFour = normalizeLastFour(String(formData.get("lastFour") ?? ""));
  const isRupay =
    formData.get("isRupay") === "on" ||
    formData.get("isRupay") === "true";
  return { lastFour, isRupay };
}

export async function createCreditCard(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const outstanding = parseAmount(
    String(formData.get("currentOutstanding") ?? "0"),
  );
  const sharesLimitWithId = await parseSharesLimitWithId(
    user.id,
    null,
    formData,
  );
  const limitRaw = String(formData.get("creditLimit") ?? "").trim();
  const creditLimit =
    sharesLimitWithId || !limitRaw ? null : parseAmount(limitRaw);
  const billingDay = clampBillingDay(
    Number(formData.get("billingDay") ?? "") || null,
  );
  const paymentDueDay = clampBillingDay(
    Number(formData.get("paymentDueDay") ?? "") || null,
  );
  const status = String(formData.get("status") ?? "Active").trim() || "Active";
  const { lastFour, isRupay } = parseCardExtra(formData);

  if (!name) throw new Error("Name is required");

  const [row] = await db
    .insert(creditCards)
    .values({
      userId: user.id,
      name,
      currentOutstanding: Math.max(0, outstanding).toFixed(2),
      creditLimit: creditLimit != null ? creditLimit.toFixed(2) : null,
      sharesLimitWithId,
      billingDay,
      paymentDueDay,
      lastFour,
      isRupay,
      status,
    })
    .returning();

  revalidateCards(row?.id);
  if (sharesLimitWithId) revalidateCards(sharesLimitWithId);
}

export async function updateCreditCard(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const outstanding = parseAmount(
    String(formData.get("currentOutstanding") ?? "0"),
  );
  const sharesLimitWithId = await parseSharesLimitWithId(user.id, id, formData);
  const limitRaw = String(formData.get("creditLimit") ?? "").trim();
  const creditLimit =
    sharesLimitWithId || !limitRaw ? null : parseAmount(limitRaw);
  const billingDay = clampBillingDay(
    Number(formData.get("billingDay") ?? "") || null,
  );
  const paymentDueDay = clampBillingDay(
    Number(formData.get("paymentDueDay") ?? "") || null,
  );
  const status = String(formData.get("status") ?? "Active").trim() || "Active";
  const { lastFour, isRupay } = parseCardExtra(formData);

  if (!id || !name) throw new Error("Missing fields");

  // Clear dependents pointing at this card if it starts sharing with another.
  if (sharesLimitWithId) {
    await db
      .update(creditCards)
      .set({ sharesLimitWithId: null })
      .where(
        and(
          eq(creditCards.userId, user.id),
          eq(creditCards.sharesLimitWithId, id),
        ),
      );
  }

  await db
    .update(creditCards)
    .set({
      name,
      currentOutstanding: Math.max(0, outstanding).toFixed(2),
      creditLimit: creditLimit != null ? creditLimit.toFixed(2) : null,
      sharesLimitWithId,
      billingDay,
      paymentDueDay,
      lastFour,
      isRupay,
      status,
    })
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, user.id)));

  revalidateCards(id);
  if (sharesLimitWithId) revalidateCards(sharesLimitWithId);
}

export async function deleteCreditCard(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const activities = await db
    .select()
    .from(cardActivities)
    .where(and(eq(cardActivities.cardId, id), eq(cardActivities.userId, user.id)));

  for (const a of activities) {
    await deleteLinkedCashflowTx(user.id, a.transactionId);
    await deleteLinkedCashflowTx(user.id, a.relatedTransactionId);
  }

  await db
    .update(transactions)
    .set({ creditCardId: null })
    .where(
      and(eq(transactions.creditCardId, id), eq(transactions.userId, user.id)),
    );

  await db
    .delete(creditCards)
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, user.id)));

  revalidateCards(id);
}

export async function logWalletRecharge(formData: FormData) {
  const user = await requireUser();
  const cardId = String(formData.get("cardId") ?? "");
  const date = String(formData.get("date") ?? "");
  const walletCredit = parseAmount(String(formData.get("walletCredit") ?? "0"));
  const cardCharged = parseAmount(String(formData.get("cardCharged") ?? "0"));
  const note = String(formData.get("description") ?? "").trim();

  if (!cardId || !date) throw new Error("Missing fields");
  if (walletCredit <= 0 || cardCharged <= 0) {
    throw new Error("Enter wallet credit and card charged amounts");
  }
  if (cardCharged < walletCredit) {
    throw new Error("Card charged cannot be less than wallet credit");
  }

  const [card] = await db
    .select({ name: creditCards.name })
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, user.id)))
    .limit(1);
  if (!card) throw new Error("Card not found");

  const fee = Math.round((cardCharged - walletCredit) * 100) / 100;
  const description =
    note ||
    `Card → wallet ₹${walletCredit.toFixed(0)}` +
      (fee > 0 ? ` (card ₹${cardCharged.toFixed(0)}, fee ₹${fee.toFixed(0)})` : "") +
      ` — ${card.name}`;

  const cats = await ensureCardCashflowCategories(user.id);
  // Expense for what the card was charged; do not set creditCardId on the tx
  // (outstanding is updated via the activity below — avoid double-counting).
  const [tx] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      date,
      occurredAt: new Date(`${date}T12:00:00`),
      description,
      categoryId: cats.creditCardCategoryId,
      type: "expense",
      amount: cardCharged.toFixed(2),
      creditCardId: null,
    })
    .returning();

  await db.insert(cardActivities).values({
    userId: user.id,
    cardId,
    date,
    activityType: "wallet_recharge",
    amount: walletCredit.toFixed(2),
    outstandingDelta: cardCharged.toFixed(2),
    walletCredit: walletCredit.toFixed(2),
    cardCharged: cardCharged.toFixed(2),
    description,
    transactionId: tx?.id ?? null,
  });
  await adjustCardOutstanding(user.id, cardId, cardCharged);
  revalidateCards(cardId);
}

export async function logCardFee(formData: FormData) {
  const user = await requireUser();
  const cardId = String(formData.get("cardId") ?? "");
  const date = String(formData.get("date") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "0"));
  const logExpense =
    formData.get("logExpense") === "on" ||
    formData.get("logExpense") === "true";
  const note = String(formData.get("description") ?? "").trim();

  if (!cardId || !date) throw new Error("Missing fields");
  if (amount <= 0) throw new Error("Enter fee amount");

  const [card] = await db
    .select({ name: creditCards.name })
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, user.id)))
    .limit(1);
  if (!card) throw new Error("Card not found");

  let transactionId: string | null = null;
  if (logExpense) {
    const cats = await ensureCardCashflowCategories(user.id);
    const [tx] = await db
      .insert(transactions)
      .values({
        userId: user.id,
        date,
        occurredAt: new Date(`${date}T12:00:00`),
        description: note || `Card fee — ${card.name}`,
        categoryId: cats.cardFeesCategoryId,
        type: "expense",
        amount: amount.toFixed(2),
      })
      .returning();
    transactionId = tx?.id ?? null;
  }

  await db.insert(cardActivities).values({
    userId: user.id,
    cardId,
    date,
    activityType: "fee",
    amount: amount.toFixed(2),
    outstandingDelta: amount.toFixed(2),
    description: note || `Fee ₹${amount.toFixed(0)}`,
    transactionId,
  });
  await adjustCardOutstanding(user.id, cardId, amount);
  revalidateCards(cardId);
}

export async function logCardBillPayment(formData: FormData) {
  const user = await requireUser();
  const cardId = String(formData.get("cardId") ?? "");
  const date = String(formData.get("date") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "0"));
  const bankAccountId =
    String(formData.get("bankAccountId") ?? "").trim() || null;
  const note = String(formData.get("description") ?? "").trim();

  if (!cardId || !date) throw new Error("Missing fields");
  if (amount <= 0) throw new Error("Enter payment amount");
  if (!bankAccountId) throw new Error("Choose the account you paid from");

  const [card] = await db
    .select({ name: creditCards.name })
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, user.id)))
    .limit(1);
  if (!card) throw new Error("Card not found");

  const cats = await ensureCardCashflowCategories(user.id);
  const [tx] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      date,
      occurredAt: new Date(`${date}T12:00:00`),
      description: note || `Bill payment — ${card.name}`,
      categoryId: cats.creditCardCategoryId,
      type: "expense",
      amount: amount.toFixed(2),
      // Bill payment is from bank — do not treat as card spend.
      creditCardId: null,
      bankAccountId,
    })
    .returning();

  if (amount > 0) {
    const { applyBankBalanceForTransaction } = await import(
      "@/lib/bank-account-cashflow"
    );
    await applyBankBalanceForTransaction({
      userId: user.id,
      bankAccountId,
      type: "expense",
      amount,
    });
  }

  await db.insert(cardActivities).values({
    userId: user.id,
    cardId,
    date,
    activityType: "bill_payment",
    amount: amount.toFixed(2),
    outstandingDelta: (-amount).toFixed(2),
    description: note || `Bill payment ₹${amount.toFixed(0)}`,
    transactionId: tx?.id ?? null,
  });
  await adjustCardOutstanding(user.id, cardId, -amount);
  revalidateCards(cardId);
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${bankAccountId}`);
}

export async function deleteCardActivity(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const [row] = await db
    .select()
    .from(cardActivities)
    .where(and(eq(cardActivities.id, id), eq(cardActivities.userId, user.id)))
    .limit(1);
  if (!row) return;

  const delta = toNumber(row.outstandingDelta);
  if (delta) await adjustCardOutstanding(user.id, row.cardId, -delta);

  await deleteLinkedCashflowTx(user.id, row.transactionId);
  await deleteLinkedCashflowTx(user.id, row.relatedTransactionId);

  await db
    .delete(cardActivities)
    .where(and(eq(cardActivities.id, id), eq(cardActivities.userId, user.id)));

  revalidateCards(row.cardId);
}

