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
      <AppNav name={user.name} />
      {children}
    </div>
  );
}
