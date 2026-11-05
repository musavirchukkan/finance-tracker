import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  insertTransactionForUser,
} from "@/lib/ledger-data";
import { parseAmount } from "@/lib/money";
import { parseUtcInstant } from "@/lib/utc-time";
import { revalidatePath } from "next/cache";

const bodySchema = z.object({
  date: z.string().min(1).optional(),
  occurredAt: z.string().optional(),
  description: z.string().optional().default(""),
  categoryId: z.string().optional().default(""),
  type: z.enum(["expense", "income", "transfer"]),
  amount: z.union([z.string(), z.number()]),
  clientId: z.string().min(1).optional(),
  creditCardId: z.string().uuid().nullable().optional(),
  cardBillPayId: z.string().uuid().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  transferToBankAccountId: z.string().uuid().nullable().optional(),
}).superRefine((val, ctx) => {
  if (val.type !== "transfer" && !z.string().uuid().safeParse(val.categoryId).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid category",
      path: ["categoryId"],
    });
  }
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsedInstant = parsed.data.occurredAt
    ? parseUtcInstant(parsed.data.occurredAt)
    : new Date();
  if (Number.isNaN(parsedInstant.getTime())) {
    return NextResponse.json({ error: "Invalid time" }, { status: 400 });
  }
  const occurredAt = parsedInstant.toISOString();
  const date =
    parsed.data.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.date)
      ? parsed.data.date
      : occurredAt.slice(0, 10);

  try {
    const amount = parseAmount(String(parsed.data.amount));
    if (!(amount > 0)) {
      return NextResponse.json({ error: "Enter a positive amount" }, { status: 400 });
    }
    const result = await insertTransactionForUser(session.user.id, {
      date,
      occurredAt,
      description: (parsed.data.description ?? "").trim(),
      categoryId: parsed.data.categoryId || "",
      type: parsed.data.type,
      amount,
      clientId: parsed.data.clientId,
      creditCardId:
        parsed.data.type === "transfer"
          ? null
          : (parsed.data.creditCardId ?? null),
      cardBillPayId:
        parsed.data.type === "transfer"
          ? null
          : (parsed.data.cardBillPayId ?? null),
      bankAccountId: parsed.data.bankAccountId ?? null,
      transferToBankAccountId:
        parsed.data.type === "transfer"
          ? (parsed.data.transferToBankAccountId ?? null)
          : null,
    });
    if (!result.duplicate) {
      revalidatePath("/transactions");
      revalidatePath("/budget");
      revalidatePath("/overview");
      revalidatePath("/analytics");
      revalidatePath("/goals");
      revalidatePath("/quick-add");
      revalidatePath("/cards");
      revalidatePath("/accounts");
      if (parsed.data.creditCardId) {
        revalidatePath(`/cards/${parsed.data.creditCardId}`);
      }
      if (parsed.data.cardBillPayId) {
        revalidatePath(`/cards/${parsed.data.cardBillPayId}`);
      }
      if (parsed.data.bankAccountId) {
        revalidatePath(`/accounts/${parsed.data.bankAccountId}`);
      }
      if (parsed.data.transferToBankAccountId) {
        revalidatePath(`/accounts/${parsed.data.transferToBankAccountId}`);
      }
    }
    return NextResponse.json({
      ok: true,
      id: result.id,
      duplicate: result.duplicate,
      clientId: parsed.data.clientId,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
