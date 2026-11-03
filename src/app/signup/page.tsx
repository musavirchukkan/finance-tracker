import Image from "next/image";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if ("password" in params || "email" in params) {
    const callback = params.callbackUrl;
    const qs =
      typeof callback === "string" && callback.startsWith("/")
        ? `?callbackUrl=${encodeURIComponent(callback)}`
        : "";
    redirect(`/signup${qs}`);
  }

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
          <p>Create your ledger — income, spend, debt, and wealth in one place.</p>
        </header>
        <section className="login-panel" aria-label="Create account">
          <h2 className="login-heading">Create account</h2>
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <SignupForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
