import "dotenv/config";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  categories,
  debtSettings,
  users,
} from "./schema";
import { defaultGoalDate } from "../debt-projection";

const DEFAULT_CATEGORIES = [
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

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

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
    console.log(`User ${email} already exists — skipping seed.`);
    await client.end();
    return;
  }

  const passwordHash = await hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash })
    .returning();

  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((catName, index) => ({
      userId: user.id,
      name: catName,
      sortOrder: index,
    })),
  );

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
