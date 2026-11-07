"use server";

import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  BCRYPT_ROUNDS,
  PASSWORD_CHANGE_RATE_LIMIT,
} from "@/lib/constants";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  formString,
  parseOrThrow,
  zNonEmpty,
  zPassword,
} from "@/lib/form-schemas";
import { assertWriteRateLimit } from "@/lib/rate-limit";
import { UserFacingError } from "@/lib/safe-error";
import { requireUser } from "@/lib/session";

const changePasswordSchema = z.object({
  currentPassword: zNonEmpty,
  newPassword: zPassword,
  confirmPassword: z.string(),
});

export async function changePassword(formData: FormData) {
  const sessionUser = await requireUser();
  await assertWriteRateLimit(sessionUser.id, "password", PASSWORD_CHANGE_RATE_LIMIT.limit, PASSWORD_CHANGE_RATE_LIMIT.windowMs);
  const raw = parseOrThrow(
    changePasswordSchema,
    {
      currentPassword: formString(formData, "currentPassword"),
      newPassword: formString(formData, "newPassword"),
      confirmPassword: formString(formData, "confirmPassword"),
    },
    "All password fields are required",
  );

  if (raw.newPassword !== raw.confirmPassword) {
    throw new UserFacingError("New passwords do not match");
  }
  if (raw.newPassword === raw.currentPassword) {
    throw new UserFacingError("New password must be different from the current one");
  }

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!row) {
    throw new UserFacingError("Account not found. Sign out and sign in again.");
  }

  const valid = await compare(raw.currentPassword, row.passwordHash);
  if (!valid) {
    throw new UserFacingError("Current password is incorrect");
  }

  const passwordHash = await hash(raw.newPassword, BCRYPT_ROUNDS);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, row.id));

  revalidatePath("/settings");
}
