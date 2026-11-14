"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WRITE_RATE_LIMIT } from "@/lib/constants";
import { db } from "@/lib/db";
import { bankAccounts, creditCards } from "@/lib/db/schema";
import {
  formCheckbox,
  formString,
  parseOrThrow,
  zUuid,
} from "@/lib/form-schemas";
import { assertWriteRateLimit } from "@/lib/rate-limit";
import {
  invalidateBankOptionsCache,
  invalidateCardOptionsCache,
} from "@/lib/ref-cache";
import { requireUser } from "@/lib/session";

function revalidatePaymentPickerPaths() {
  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/quick-add");
  revalidatePath("/accounts");
  revalidatePath("/cards");
  revalidatePath("/overview");
}

/**
 * Bulk-save which banks/cards appear in transaction payment pickers.
 * Checkbox names: `bank:<uuid>` / `card:<uuid>` (checked = show).
 */
export async function updatePaymentPickerVisibility(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(
    user.id,
    "write",
    WRITE_RATE_LIMIT.limit,
    WRITE_RATE_LIMIT.windowMs,
  );

  const [banks, cards] = await Promise.all([
    db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, user.id)),
    db
      .select({ id: creditCards.id })
      .from(creditCards)
      .where(eq(creditCards.userId, user.id)),
  ]);

  const showBankIds: string[] = [];
  const hideBankIds: string[] = [];
  for (const b of banks) {
    if (formCheckbox(formData, `bank:${b.id}`)) showBankIds.push(b.id);
    else hideBankIds.push(b.id);
  }

  const showCardIds: string[] = [];
  const hideCardIds: string[] = [];
  for (const c of cards) {
    if (formCheckbox(formData, `card:${c.id}`)) showCardIds.push(c.id);
    else hideCardIds.push(c.id);
  }

  const now = new Date();
  const updates: Promise<unknown>[] = [];

  if (showBankIds.length > 0) {
    updates.push(
      db
        .update(bankAccounts)
        .set({ showInPaymentPicker: true, updatedAt: now })
        .where(
          and(
            eq(bankAccounts.userId, user.id),
            inArray(bankAccounts.id, showBankIds),
          ),
        ),
    );
  }
  if (hideBankIds.length > 0) {
    updates.push(
      db
        .update(bankAccounts)
        .set({ showInPaymentPicker: false, updatedAt: now })
        .where(
          and(
            eq(bankAccounts.userId, user.id),
            inArray(bankAccounts.id, hideBankIds),
          ),
        ),
    );
  }
  if (showCardIds.length > 0) {
    updates.push(
      db
        .update(creditCards)
        .set({ showInPaymentPicker: true, updatedAt: now })
        .where(
          and(
            eq(creditCards.userId, user.id),
            inArray(creditCards.id, showCardIds),
          ),
        ),
    );
  }
  if (hideCardIds.length > 0) {
    updates.push(
      db
        .update(creditCards)
        .set({ showInPaymentPicker: false, updatedAt: now })
        .where(
          and(
            eq(creditCards.userId, user.id),
            inArray(creditCards.id, hideCardIds),
          ),
        ),
    );
  }

  await Promise.all(updates);
  await Promise.all([
    invalidateBankOptionsCache(user.id),
    invalidateCardOptionsCache(user.id),
  ]);
  revalidatePaymentPickerPaths();
}

/** One-shot show/hide for a single bank or card (edit forms / quick toggles). */
export async function setPaymentPickerVisibility(formData: FormData) {
  const user = await requireUser();
  await assertWriteRateLimit(
    user.id,
    "write",
    WRITE_RATE_LIMIT.limit,
    WRITE_RATE_LIMIT.windowMs,
  );

  const raw = parseOrThrow(
    z.object({
      id: zUuid,
      kind: z.enum(["bank", "card"]),
    }),
    {
      id: formString(formData, "id").trim(),
      kind: formString(formData, "kind").trim(),
    },
    "Missing fields",
  );
  const { id, kind } = raw;
  const show = formCheckbox(formData, "show");

  const now = new Date();
  if (kind === "bank") {
    await db
      .update(bankAccounts)
      .set({ showInPaymentPicker: show, updatedAt: now })
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, user.id)));
    await invalidateBankOptionsCache(user.id);
  } else {
    await db
      .update(creditCards)
      .set({ showInPaymentPicker: show, updatedAt: now })
      .where(and(eq(creditCards.id, id), eq(creditCards.userId, user.id)));
    await invalidateCardOptionsCache(user.id);
  }
  revalidatePaymentPickerPaths();
}
