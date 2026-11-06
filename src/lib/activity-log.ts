import { activityEvents } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";

export type ActivitySource = "server_action" | "api" | "offline_sync";

export type TransactionActivitySnapshot = {
  type: string;
  amount: number;
  date?: string | null;
  description?: string | null;
  categoryId?: string | null;
  bankAccountId?: string | null;
  transferToBankAccountId?: string | null;
  creditCardId?: string | null;
  cardBillPayId?: string | null;
};

export function transactionActivitySnapshot(
  input: TransactionActivitySnapshot,
): TransactionActivitySnapshot {
  return {
    type: input.type,
    amount: input.amount,
    date: input.date ?? null,
    description: input.description ?? null,
    categoryId: input.categoryId ?? null,
    bankAccountId: input.bankAccountId ?? null,
    transferToBankAccountId: input.transferToBankAccountId ?? null,
    creditCardId: input.creditCardId ?? null,
    cardBillPayId: input.cardBillPayId ?? null,
  };
}

function legLabel(bankAccountId: string | null | undefined): string {
  return bankAccountId ? "bank" : "cash";
}

/** Short human summary for transaction mutations (no secrets). */
export function summarizeTransactionActivity(args: {
  verb: "Created" | "Updated" | "Deleted";
  snapshot: TransactionActivitySnapshot;
}): string {
  const amount = formatINR(args.snapshot.amount);
  const type = args.snapshot.type || "transaction";
  if (type === "transfer") {
    const from = legLabel(args.snapshot.bankAccountId);
    const to = legLabel(args.snapshot.transferToBankAccountId);
    return `${args.verb} transfer · ${amount} · ${from} → ${to}`;
  }
  return `${args.verb} ${type} · ${amount}`;
}

/**
 * Best-effort append-only audit write. Never throws to callers —
 * a failed audit must not roll back the user mutation.
 */
export async function recordActivityEvent(args: {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: TransactionActivitySnapshot | Record<string, unknown> | null;
  after?: TransactionActivitySnapshot | Record<string, unknown> | null;
  source?: ActivitySource;
}): Promise<void> {
  try {
    await db.insert(activityEvents).values({
      userId: args.userId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId ?? null,
      summary: args.summary,
      before: (args.before as Record<string, unknown> | null) ?? null,
      after: (args.after as Record<string, unknown> | null) ?? null,
      source: args.source ?? "server_action",
    });
  } catch (err) {
    console.error("[activity-log] failed to record event", err);
  }
}
