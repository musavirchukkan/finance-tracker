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
  clampBillingDay,
  nextCycleDate,
} from "@/lib/credit-cards";
import {
  computeOutstanding,
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

export async function listCreditCards(userId: string) {
  await migrateRollingCreditCards(userId);
  const rows = await db
    .select()
    .from(creditCards)
    .where(eq(creditCards.userId, userId))
    .orderBy(asc(creditCards.name));

  return rows.map((c) => ({
    ...c,
    outstandingNum: toNumber(c.currentOutstanding),
    creditLimitNum: c.creditLimit != null ? toNumber(c.creditLimit) : null,
    nextBillDate: nextCycleDate(c.billingDay),
    nextDueDate: nextCycleDate(c.paymentDueDay),
  }));
}

export async function getCreditCardDetail(userId: string, cardId: string) {
  await migrateRollingCreditCards(userId);
  const [card] = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, userId)))
    .limit(1);
  if (!card) return null;

  const activities = await db
    .select()
    .from(cardActivities)
    .where(
      and(eq(cardActivities.cardId, cardId), eq(cardActivities.userId, userId)),
    )
    .orderBy(desc(cardActivities.date), desc(cardActivities.createdAt));

  return {
    card: {
      ...card,
      outstandingNum: toNumber(card.currentOutstanding),
      creditLimitNum:
        card.creditLimit != null ? toNumber(card.creditLimit) : null,
      nextBillDate: nextCycleDate(card.billingDay),
      nextDueDate: nextCycleDate(card.paymentDueDay),
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

export async function createCreditCard(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const outstanding = parseAmount(
    String(formData.get("currentOutstanding") ?? "0"),
  );
  const limitRaw = String(formData.get("creditLimit") ?? "").trim();
  const creditLimit = limitRaw ? parseAmount(limitRaw) : null;
  const billingDay = clampBillingDay(
    Number(formData.get("billingDay") ?? "") || null,
  );
  const paymentDueDay = clampBillingDay(
    Number(formData.get("paymentDueDay") ?? "") || null,
  );
  const status = String(formData.get("status") ?? "Active").trim() || "Active";

  if (!name) throw new Error("Name is required");

  const [row] = await db
    .insert(creditCards)
    .values({
      userId: user.id,
      name,
      currentOutstanding: Math.max(0, outstanding).toFixed(2),
      creditLimit: creditLimit != null ? creditLimit.toFixed(2) : null,
      billingDay,
      paymentDueDay,
      status,
    })
    .returning();

  revalidateCards(row?.id);
}

export async function updateCreditCard(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const outstanding = parseAmount(
    String(formData.get("currentOutstanding") ?? "0"),
  );
  const limitRaw = String(formData.get("creditLimit") ?? "").trim();
  const creditLimit = limitRaw ? parseAmount(limitRaw) : null;
  const billingDay = clampBillingDay(
    Number(formData.get("billingDay") ?? "") || null,
  );
  const paymentDueDay = clampBillingDay(
    Number(formData.get("paymentDueDay") ?? "") || null,
  );
  const status = String(formData.get("status") ?? "Active").trim() || "Active";

  if (!id || !name) throw new Error("Missing fields");

  await db
    .update(creditCards)
    .set({
      name,
      currentOutstanding: Math.max(0, outstanding).toFixed(2),
      creditLimit: creditLimit != null ? creditLimit.toFixed(2) : null,
      billingDay,
      paymentDueDay,
      status,
    })
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, user.id)));

  revalidateCards(id);
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

  const fee = Math.round((cardCharged - walletCredit) * 100) / 100;
  const description =
    note ||
    `Wallet recharge ₹${walletCredit.toFixed(0)}` +
      (fee > 0 ? ` (card ₹${cardCharged.toFixed(0)}, fee ₹${fee.toFixed(0)})` : "");

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
  });
  await adjustCardOutstanding(user.id, cardId, cardCharged);
  revalidateCards(cardId);
}

export async function logWalletCashout(formData: FormData) {
  const user = await requireUser();
  const cardId = String(formData.get("cardId") ?? "");
  const date = String(formData.get("date") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "0"));
  const bankFee = parseAmount(String(formData.get("bankFee") ?? "0"));
  const note = String(formData.get("description") ?? "").trim();

  if (!cardId || !date) throw new Error("Missing fields");
  if (amount <= 0) throw new Error("Enter amount to bank");

  const cats = await ensureCardCashflowCategories(user.id);
  const net = Math.max(0, Math.round((amount - bankFee) * 100) / 100);
  const [card] = await db
    .select({ name: creditCards.name })
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, user.id)))
    .limit(1);
  if (!card) throw new Error("Card not found");

  const [incomeTx] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      date,
      occurredAt: new Date(`${date}T12:00:00`),
      description:
        note || `Wallet → bank — ${card.name}`,
      categoryId: cats.walletCashoutCategoryId,
      type: "income",
      amount: net.toFixed(2),
    })
    .returning();

  let feeTxId: string | null = null;
  if (bankFee > 0) {
    const [feeTx] = await db
      .insert(transactions)
      .values({
        userId: user.id,
        date,
        occurredAt: new Date(`${date}T12:00:00`),
        description: `Bank charge — wallet cashout — ${card.name}`,
        categoryId: cats.bankChargesCategoryId,
        type: "expense",
        amount: bankFee.toFixed(2),
      })
      .returning();
    feeTxId = feeTx?.id ?? null;
  }

  await db.insert(cardActivities).values({
    userId: user.id,
    cardId,
    date,
    activityType: "wallet_cashout",
    amount: amount.toFixed(2),
    outstandingDelta: "0",
    bankFee: bankFee > 0 ? bankFee.toFixed(2) : null,
    description: note || `Wallet → bank ₹${amount.toFixed(0)}`,
    transactionId: incomeTx?.id ?? null,
    relatedTransactionId: feeTxId,
  });

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
  const note = String(formData.get("description") ?? "").trim();

  if (!cardId || !date) throw new Error("Missing fields");
  if (amount <= 0) throw new Error("Enter payment amount");

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
    })
    .returning();

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

