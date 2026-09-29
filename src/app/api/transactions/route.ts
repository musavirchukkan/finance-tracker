import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { insertTransactionForUser } from "@/lib/actions";
import { parseAmount } from "@/lib/money";
import { revalidatePath } from "next/cache";

const bodySchema = z.object({
  date: z.string().min(1).optional(),
  occurredAt: z.string().optional(),
  description: z.string().optional().default(""),
  categoryId: z.string().uuid(),
  type: z.enum(["expense", "income"]),
  amount: z.union([z.string(), z.number()]),
  clientId: z.string().min(1).optional(),
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

  const occurredAt =
    parsed.data.occurredAt ??
    (parsed.data.date
      ? `${parsed.data.date}T${new Date().toISOString().slice(11, 19)}`
      : new Date().toISOString());
  const date = parsed.data.date ?? occurredAt.slice(0, 10);

  try {
    const amount = parseAmount(String(parsed.data.amount));
    const result = await insertTransactionForUser(session.user.id, {
      date,
      occurredAt,
      description: (parsed.data.description ?? "").trim(),
      categoryId: parsed.data.categoryId,
      type: parsed.data.type,
      amount,
      clientId: parsed.data.clientId,
    });
    if (!result.duplicate) {
      revalidatePath("/transactions");
      revalidatePath("/budget");
      revalidatePath("/overview");
      revalidatePath("/analytics");
      revalidatePath("/goals");
      revalidatePath("/quick-add");
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
