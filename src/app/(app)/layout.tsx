import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppNav name={user.name} />
      <main id="main" className="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
