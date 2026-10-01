"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { NavIcon } from "@/components/nav-icons";
import { clearClientState } from "@/lib/client-cache";

function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <div className="brand-mark">
      <Image
        className="brand-icon"
        src="/icons/icon-192.png"
        alt=""
        width={size}
        height={size}
        priority
      />
      <span className="brand">Ledger</span>
    </div>
  );
}

const menuLinks = [
  { href: "/overview", label: "Overview", short: "Home", icon: "overview" },
  { href: "/debt", label: "Debt", short: "Debt", icon: "debt" },
  {
    href: "/transactions",
    label: "Transactions",
    short: "Txns",
    icon: "list",
  },
  { href: "/budget", label: "Budget", short: "Budget", icon: "budget" },
  { href: "/goals", label: "Goals", short: "Goals", icon: "goals" },
] as const;

const toolLinks = [
  { href: "/settings", label: "Settings", short: "Settings", icon: "settings" },
] as const;

const mobileMore = {
  href: "/more",
  label: "More",
  short: "More",
  icon: "settings",
} as const;

const mobileLeft = [menuLinks[0], menuLinks[1]] as const;
const mobileRight = [menuLinks[4], mobileMore] as const;

export function AppNav({ name }: { name?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    for (const link of [
      ...menuLinks,
      ...toolLinks,
      mobileMore,
      { href: "/quick-add" },
    ]) {
      router.prefetch(link.href);
    }
  }, [router]);

  function go(href: string) {
    if (pathname.startsWith(href)) {
      setPendingHref(null);
      return;
    }
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  function isActive(href: string) {
    if (href === "/more") {
      return (
        pathname.startsWith("/more") ||
        pathname.startsWith("/settings") ||
        pendingHref === "/more" ||
        pendingHref === "/settings"
      );
    }
    return pathname.startsWith(href) || pendingHref === href;
  }

  const navigating = isPending || !!pendingHref;
  const firstName = name?.split(" ")[0] ?? "there";

  return (
    <>
      <div
        className={`nav-progress ${navigating ? "active" : ""}`}
        aria-hidden
      />

      <aside className="sidebar" aria-label="Sidebar">
        <div style={{ marginBottom: "1.25rem" }}>
          <h1 className="sr-only">Ledger</h1>
          <BrandMark size={28} />
        </div>

        <p className="nav-section-label">Menu</p>
        <nav className="side-nav" aria-label="Main">
          {menuLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <button
                key={link.href}
                type="button"
                className={active ? "side-link active" : "side-link"}
                aria-current={active ? "page" : undefined}
                onPointerDown={() => router.prefetch(link.href)}
                onClick={() => go(link.href)}
              >
                <NavIcon name={link.icon} />
                {link.label}
              </button>
            );
          })}
        </nav>

        <p className="nav-section-label">Tools</p>
        <nav className="side-nav" aria-label="Tools">
          {toolLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <button
                key={link.href}
                type="button"
                className={active ? "side-link active" : "side-link"}
                aria-current={active ? "page" : undefined}
                onPointerDown={() => router.prefetch(link.href)}
                onClick={() => go(link.href)}
              >
                <NavIcon name={link.icon} />
                {link.label}
              </button>
            );
          })}
        </nav>

        <div className="top-bar-user">
          <span className="muted">{name ?? firstName}</span>
          <button
            className="btn btn-ghost btn-xs"
            type="button"
            onClick={async () => {
              await clearClientState();
              await signOut({ callbackUrl: "/login" });
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <header className="mobile-top">
        <BrandMark size={24} />
        <div className="mobile-top-actions">
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => go("/overview")}
            aria-label="Current month"
          >
            Month
          </button>
          <button type="button" className="icon-btn" aria-label="Notifications">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </button>
        </div>
      </header>

      <nav className="bottom-nav" aria-label="Mobile">
        {mobileLeft.map((link) => {
          const active = isActive(link.href);
          return (
            <button
              key={link.href}
              type="button"
              className={active ? "bottom-link active" : "bottom-link"}
              aria-current={active ? "page" : undefined}
              onPointerDown={() => router.prefetch(link.href)}
              onClick={() => go(link.href)}
            >
              <span className="bottom-icon">
                <NavIcon name={link.icon} />
              </span>
              {link.short}
            </button>
          );
        })}
        <button
          type="button"
          className={
            pathname.startsWith("/quick-add")
              ? "bottom-link bottom-add active"
              : "bottom-link bottom-add"
          }
          aria-label="Quick add transaction"
          aria-current={pathname.startsWith("/quick-add") ? "page" : undefined}
          onPointerDown={() => router.prefetch("/quick-add")}
          onClick={() => go("/quick-add")}
        >
          <span className="bottom-add-btn" aria-hidden>
            +
          </span>
          Add
        </button>
        {mobileRight.map((link) => {
          const active = isActive(link.href);
          return (
            <button
              key={link.href}
              type="button"
              className={active ? "bottom-link active" : "bottom-link"}
              aria-current={active ? "page" : undefined}
              onPointerDown={() => router.prefetch(link.href)}
              onClick={() => go(link.href)}
            >
              <span className="bottom-icon">
                <NavIcon name={link.icon} />
              </span>
              {link.short}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        className="fab"
        aria-label="Quick add transaction"
        onClick={() => go("/quick-add")}
      >
        +
      </button>
    </>
  );
}
