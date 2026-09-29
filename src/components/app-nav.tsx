"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { signOut } from "next-auth/react";
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
  { href: "/settings", label: "Settings", short: "More", icon: "settings" },
] as const;

const mobileLeft = [menuLinks[0], menuLinks[1]] as const;
const mobileRight = [menuLinks[4], toolLinks[0]] as const;

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "overview") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (name === "debt") {
    return (
      <svg {...common}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M6 15h4" />
      </svg>
    );
  }
  if (name === "list") {
    return (
      <svg {...common}>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </svg>
    );
  }
  if (name === "budget") {
    return (
      <svg {...common}>
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (name === "goals") {
    return (
      <svg {...common}>
        <path d="m3 17 6-6 4 4 8-8" />
        <path d="M14 7h7v7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

export function AppNav({ name }: { name?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    for (const link of [...menuLinks, ...toolLinks, { href: "/quick-add" }]) {
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
