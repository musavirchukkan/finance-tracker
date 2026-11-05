import { hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { BCRYPT_ROUNDS, PASSWORD_MIN_LENGTH } from "@/lib/constants";
import { db } from "@/lib/db";
import { categories, debtSettings, users } from "@/lib/db/schema";
import { defaultIconForCategoryName } from "@/lib/category-icons";
import { defaultGoalDate } from "@/lib/debt-projection";

const EXPENSE_CATEGORIES = [
  "Auto",
  "Entertainment",
  "Food",
  "Home",
  "Medical",
  "Personal Items",
  "Travel",
  "Utilities",
  "Debt / EMI",
  "Lent",
  "Kuri",
  "Credit Card",
  "Card fees",
  "Bank charges",
  "Other",
];

const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Borrowed",
  "Lent repaid",
  "Kuri payout",
  "Wallet cashout",
  "Other Income",
];

export async function ensureDefaultCategories(userId: string) {
  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const names = new Set(existing.map((c) => c.name));

  const toInsert = [
    ...EXPENSE_CATEGORIES.map((name, index) => ({
      userId,
      name,
      kind: "expense" as const,
      icon: defaultIconForCategoryName(name),
      sortOrder: index,
    })),
    ...INCOME_CATEGORIES.map((name, index) => ({
      userId,
      name,
      kind: "income" as const,
      icon: defaultIconForCategoryName(name),
      sortOrder: 100 + index,
    })),
  ].filter((c) => !names.has(c.name));

  if (toInsert.length > 0) {
    await db.insert(categories).values(toInsert);
  }

  for (const row of existing) {
    const updates: { kind?: string; icon?: string } = {};
    if (INCOME_CATEGORIES.includes(row.name) && row.kind !== "income") {
      updates.kind = "income";
    }
    if (!row.icon) {
      updates.icon = defaultIconForCategoryName(row.name);
    }
    if (Object.keys(updates).length > 0) {
      await db
        .update(categories)
        .set(updates)
        .where(and(eq(categories.id, row.id), eq(categories.userId, userId)));
    }
  }
}

/** Create a user with default categories + debt settings. */
export async function createUserAccount(args: {
  email: string;
  name: string;
  password: string;
}): Promise<{ id: string; email: string; name: string }> {
  const email = args.email.trim().toLowerCase();
  const name = args.name.trim();
  if (!email || !name) throw new Error("Name and email are required");
  if (args.password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) {
    // Generic — avoid email enumeration (caller maps to GENERIC_SIGNUP_ERROR).
    throw new Error("EMAIL_TAKEN");
  }

  const passwordHash = await hash(args.password, BCRYPT_ROUNDS);
  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash })
    .returning();

  await ensureDefaultCategories(user.id);
  await db.insert(debtSettings).values({
    userId: user.id,
    goalPayoffDate: defaultGoalDate(19),
  });

  return { id: user.id, email: user.email, name: user.name };
}
