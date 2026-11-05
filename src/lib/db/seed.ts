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
  const env = getEnv();
  if (env.nodeEnv === "production" && process.env.ALLOW_DB_SEED !== "true") {
    throw new Error(
      "Refusing to seed in production. Set ALLOW_DB_SEED=true if intentional.",
    );
  }

  const { seedEmail: email, seedPassword: password, seedName: name } = env;

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
  console.log("Change SEED_* env vars; never reuse defaults in production.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
