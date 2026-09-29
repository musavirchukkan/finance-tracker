"use server";

import { AuthError } from "next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { safeCallbackUrl, type LoginState } from "@/lib/login-utils";

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
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
        return { error: "Invalid email or password" };
      }
    }

    redirect(callbackUrl);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    return { error: "Could not sign in. Try again." };
  }
}
