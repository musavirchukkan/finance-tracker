"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { AUTH_RATE_LIMIT, GENERIC_AUTH_ERROR } from "@/lib/constants";
import { safeCallbackUrl, type LoginState } from "@/lib/login-utils";
import { clientKeyFromHeaders, takeRateLimit } from "@/lib/rate-limit";

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

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const callbackUrl = safeCallbackUrl(
    String(formData.get("callbackUrl") ?? "/overview"),
  );

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  try {
    const result = await signIn("credentials", {
      email,
      password,
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
