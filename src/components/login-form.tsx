"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clearClientState } from "@/lib/client-cache";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants";
import { loginAction } from "@/lib/login-action";
import { safeCallbackUrl, type LoginState } from "@/lib/login-utils";

export function LoginForm({
  allowPublicSignup = true,
}: {
  allowPublicSignup?: boolean;
}) {
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    undefined,
  );

  // Drop prior user's cached HTML + offline queue when visiting login (H7/M1).
  useEffect(() => {
    void clearClientState();
  }, []);

  return (
    <form action={formAction} className="form-stack">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <div className="password-field">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {state?.error ? (
        <p className="neg form-status" role="alert" style={{ margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {allowPublicSignup ? (
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          New here?{" "}
          <Link
            className="linkish"
            href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          >
            Create an account
          </Link>
        </p>
      ) : null}
    </form>
  );
}
