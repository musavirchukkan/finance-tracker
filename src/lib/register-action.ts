"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { createUserAccount } from "@/lib/bootstrap-user";
import {
  AUTH_RATE_LIMIT,
  GENERIC_SIGNUP_ERROR,
  PASSWORD_MIN_LENGTH,
} from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { safeCallbackUrl, type LoginState } from "@/lib/login-utils";
import { clientKeyFromHeaders, takeRateLimit } from "@/lib/rate-limit";
import { secureStringEqual } from "@/lib/secure-compare";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    ),
  confirmPassword: z.string().min(PASSWORD_MIN_LENGTH, "Confirm your password"),
  inviteCode: z.string().optional(),
});

export async function registerAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const env = getEnv();
  if (!env.allowPublicSignup) {
    return { error: "Signup is disabled. Ask an admin for access." };
  }

  const hdrs = await headers();
  const limited = await takeRateLimit(
    clientKeyFromHeaders(hdrs, "signup"),
    AUTH_RATE_LIMIT.signup.limit,
    AUTH_RATE_LIMIT.signup.windowMs,
  );
  if (!limited.ok) {
    return {
      error: `Too many signup attempts. Try again in ${limited.retryAfterSec}s.`,
    };
  }

  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    inviteCode: String(formData.get("inviteCode") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: "Passwords do not match" };
  }

  if (
    env.signupInviteCode &&
    !secureStringEqual(
      parsed.data.inviteCode?.trim() ?? "",
      env.signupInviteCode,
    )
  ) {
    return { error: GENERIC_SIGNUP_ERROR };
  }

  const callbackUrl = safeCallbackUrl(
    String(formData.get("callbackUrl") ?? "/overview"),
  );

  try {
    await createUserAccount({
      email: parsed.data.email,
      name: parsed.data.name,
      password: parsed.data.password,
    });
  } catch {
    // Swallow EMAIL_TAKEN and other create failures with one message.
    return { error: GENERIC_SIGNUP_ERROR };
  }

  try {
    const result = await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
      redirect: false,
    });

    if (typeof result === "string") {
      const failed =
        result.includes("error=") ||
        result.includes("CredentialsSignin") ||
        /\/login(\?|$)/.test(new URL(result, "http://local").pathname);
      if (failed) {
        return {
          error: "Account created — sign in from the login page",
        };
      }
    }

    redirect(callbackUrl);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof AuthError) {
      return { error: "Account created — sign in from the login page" };
    }
    return { error: "Account created — sign in from the login page" };
  }
}
