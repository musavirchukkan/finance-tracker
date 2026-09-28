import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { insertTransactionForUser } from "@/lib/actions";
import { parseAmount } from "@/lib/money";
import { revalidatePath } from "next/cache";

const bodySchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  categoryId: z.string().uuid(),
  type: z.enum(["expense", "income"]),
  amount: z.union([z.string(), z.number()]),
  clientId: z.string().optional(),
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

  try {
    const amount = parseAmount(String(parsed.data.amount));
    await insertTransactionForUser(session.user.id, {
      date: parsed.data.date,
      description: parsed.data.description.trim(),
      categoryId: parsed.data.categoryId,
      type: parsed.data.type,
      amount,
    });
    revalidatePath("/transactions");
    revalidatePath("/budget");
    revalidatePath("/quick-add");
    return NextResponse.json({ ok: true, clientId: parsed.data.clientId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
