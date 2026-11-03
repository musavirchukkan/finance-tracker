"use server";

import { AuthError } from "next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { createUserAccount } from "@/lib/bootstrap-user";
import { safeCallbackUrl, type LoginState } from "@/lib/login-utils";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Confirm your password"),
});

export async function registerAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: "Passwords do not match" };
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
  } catch (err) {
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Could not create account";
    return { error: message };
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
