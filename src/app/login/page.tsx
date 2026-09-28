import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main
      className="app-shell"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div className="panel" style={{ width: "100%", maxWidth: 400 }}>
        <p
          className="muted"
          style={{
            margin: 0,
            fontSize: "0.75rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          Personal finance
        </p>
        <h1
          style={{
            margin: "0.35rem 0 0.35rem",
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontSize: "2rem",
          }}
        >
          Ledger
        </h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: "1.25rem" }}>
          Sign in to track budgets, spending, and debt payoff.
        </p>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
