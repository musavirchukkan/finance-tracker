import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="login-screen">
      <div className="login-stage">
        <header className="login-brand">
          <p className="eyebrow">Personal finance</p>
          <div className="brand-mark" style={{ marginTop: "0.5rem" }}>
            <Image
              className="brand-icon"
              src="/icons/icon-192.png"
              alt=""
              width={40}
              height={40}
              priority
            />
            <h1 className="brand">Ledger</h1>
          </div>
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
