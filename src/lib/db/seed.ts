import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  createUserAccount,
  ensureDefaultCategories,
} from "@/lib/bootstrap-user";
import { getEnv } from "@/lib/env";

async function main() {
  const { seedEmail: email, seedPassword: password, seedName: name } =
    getEnv();

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    await ensureDefaultCategories(existing[0].id);
    console.log(`User ${email} already exists — ensured categories.`);
    return;
  }

  await createUserAccount({ email, name, password });
  console.log("Seeded user:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log("Change SEED_* env vars before seeding in production.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
