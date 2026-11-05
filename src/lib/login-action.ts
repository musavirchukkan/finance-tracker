"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { AUTH_RATE_LIMIT, GENERIC_AUTH_ERROR } from "@/lib/constants";
import { formString } from "@/lib/form-schemas";
import { safeCallbackUrl, type LoginState } from "@/lib/login-utils";
import { clientKeyFromHeaders, takeRateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Email and password are required"),
});

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const hdrs = await headers();
  const limited = await takeRateLimit(
    clientKeyFromHeaders(hdrs, "login"),
    AUTH_RATE_LIMIT.login.limit,
    AUTH_RATE_LIMIT.login.windowMs,
  );
  if (!limited.ok) {
    return {
      error: `Too many sign-in attempts. Try again in ${limited.retryAfterSec}s.`,
    };
  }

  const parsed = loginSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Email and password are required",
    };
  }

  const callbackUrl = safeCallbackUrl(
    formString(formData, "callbackUrl") || "/overview",
  );

  try {
    const result = await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
      redirect: false,
    });

    // Auth.js returns a URL string when redirect is false
    if (typeof result === "string") {
      const failed =
        result.includes("error=") ||
        result.includes("CredentialsSignin") ||
        /\/login(\?|$)/.test(new URL(result, "http://local").pathname);
      if (failed) {
        return { error: GENERIC_AUTH_ERROR };
      }
    }

    redirect(callbackUrl);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof AuthError) {
      return { error: GENERIC_AUTH_ERROR };
    }
    return { error: "Could not sign in. Try again." };
  }
}
