"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { registerAction } from "@/lib/register-action";
import { safeCallbackUrl, type LoginState } from "@/lib/login-utils";

export function SignupForm() {
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    registerAction,
    undefined,
  );

  return (
    <form action={formAction} className="form-stack">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          autoFocus
        />
      </div>
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
            minLength={6}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      {state?.error ? (
        <p className="neg form-status" role="alert" style={{ margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
        Already have an account?{" "}
        <Link className="linkish" href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
