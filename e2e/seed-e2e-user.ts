import "dotenv/config";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  createUserAccount,
  ensureDefaultCategories,
} from "@/lib/bootstrap-user";
import { BCRYPT_ROUNDS } from "@/lib/constants";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** Never reuse app `.env` DATABASE_URL — see docs/TESTING.md. */
const DEFAULT_URL =
  "postgresql://finance:finance@127.0.0.1:5432/finance_test";

const testUrl = process.env.TEST_DATABASE_URL?.trim() || DEFAULT_URL;
process.env.DATABASE_URL = testUrl;
process.env.DATABASE_MIGRATION_URL = testUrl;
process.env.AUTH_SECRET =
  process.env.AUTH_SECRET?.trim() || "e2e-auth-secret-not-for-production";

async function main() {
  const email = (process.env.E2E_EMAIL ?? "e2e@example.test").toLowerCase();
  const password = process.env.E2E_PASSWORD ?? "e2e-password-123";
  const name = process.env.E2E_NAME ?? "E2E User";

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing[0]) {
    await ensureDefaultCategories(existing[0].id);
    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    await db
      .update(users)
      .set({ passwordHash, name, updatedAt: new Date() })
      .where(eq(users.id, existing[0].id));
    console.log(`[e2e-seed] Updated user ${email}`);
    return;
  }

  await createUserAccount({ email, name, password });
  console.log(`[e2e-seed] Created user ${email}`);
}

// postgres.js keeps the event loop alive unless we exit explicitly.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
