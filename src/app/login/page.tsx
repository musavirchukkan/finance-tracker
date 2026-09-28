import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="login-screen">
      <div className="login-stage">
        <header className="login-brand">
          <p className="eyebrow">Personal finance</p>
          <h1 className="brand">Ledger</h1>
          <p>Track income, spending, and debt payoff — clearly, on any device.</p>
        </header>
        <section className="login-panel" aria-label="Sign in">
          <h2 className="login-heading">Sign in</h2>
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
