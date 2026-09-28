import "dotenv/config";
import { hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { categories, debtSettings, users } from "./schema";
import { defaultGoalDate } from "../debt-projection";
import { getMigrationDatabaseUrl } from "./env";

const EXPENSE_CATEGORIES = [
  "Auto",
  "Entertainment",
  "Food",
  "Home",
  "Medical",
  "Personal Items",
  "Travel",
  "Utilities",
  "Other",
];

const INCOME_CATEGORIES = ["Salary", "Freelance", "Other Income"];

async function ensureCategories(
  db: ReturnType<typeof drizzle>,
  userId: string,
) {
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
      sortOrder: index,
    })),
    ...INCOME_CATEGORIES.map((name, index) => ({
      userId,
      name,
      kind: "income" as const,
      sortOrder: 100 + index,
    })),
  ].filter((c) => !names.has(c.name));

  if (toInsert.length > 0) {
    await db.insert(categories).values(toInsert);
  }

  // Backfill kind for legacy rows without income names
  for (const row of existing) {
    if (INCOME_CATEGORIES.includes(row.name) && row.kind !== "income") {
      await db
        .update(categories)
        .set({ kind: "income" })
        .where(and(eq(categories.id, row.id), eq(categories.userId, userId)));
    }
  }
}

async function main() {
  const url = getMigrationDatabaseUrl();

  const email = (process.env.SEED_EMAIL ?? "you@example.com").toLowerCase();
  const password = process.env.SEED_PASSWORD ?? "changeme123";
  const name = process.env.SEED_NAME ?? "Musavir";

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    await ensureCategories(db, existing[0].id);
    console.log(`User ${email} already exists — ensured categories.`);
    await client.end();
    return;
  }

  const passwordHash = await hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash })
    .returning();

  await ensureCategories(db, user.id);

  await db.insert(debtSettings).values({
    userId: user.id,
    goalPayoffDate: defaultGoalDate(19),
  });

  console.log("Seeded user:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log("Change SEED_* env vars before seeding in production.");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
