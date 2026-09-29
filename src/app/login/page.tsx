import Image from "next/image";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Never keep credentials in the URL (happens if JS-less GET submit leaked them)
  if ("password" in params || "email" in params) {
    const callback = params.callbackUrl;
    const qs =
      typeof callback === "string" && callback.startsWith("/")
        ? `?callbackUrl=${encodeURIComponent(callback)}`
        : "";
    redirect(`/login${qs}`);
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
