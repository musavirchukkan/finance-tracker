"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { signOut } from "next-auth/react";

const links = [
  { href: "/budget", label: "Budget", short: "Budget", icon: "budget" },
  { href: "/transactions", label: "Transactions", short: "Txns", icon: "list" },
  { href: "/debt", label: "Debt", short: "Debt", icon: "debt" },
  { href: "/settings", label: "Settings", short: "More", icon: "more" },
] as const;

async function clearClientState() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              k.includes("pages") ||
              k.includes("shell") ||
              k.startsWith("ledger-"),
          )
          .map((k) => caches.delete(k)),
      );
    }
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      reg?.active?.postMessage({ type: "CLEAR_CACHES" });
    }
    const dbReq = indexedDB.deleteDatabase("ledger-offline");
    await new Promise<void>((resolve) => {
      dbReq.onsuccess = () => resolve();
      dbReq.onerror = () => resolve();
      dbReq.onblocked = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "budget") {
    return (
      <svg {...common}>
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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
  if (name === "debt") {
    return (
      <svg {...common}>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
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
    // Warm common routes on mount for snappier phone taps
    for (const link of links) {
      router.prefetch(link.href);
    }
    router.prefetch("/quick-add");
  }, [router]);

  function go(href: string) {
    if (pathname.startsWith(href) && href !== "/quick-add") return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  const navigating = isPending || !!pendingHref;

  return (
    <>
      <div
        className={`nav-progress ${navigating ? "active" : ""}`}
        aria-hidden
      />

      <header className="top-bar">
        <div>
          <p className="eyebrow">Personal finance</p>
          <h1 className="brand">Ledger</h1>
        </div>
        <nav className="desktop-nav" aria-label="Main">
                {links.map((link) => {
            const active =
              pathname.startsWith(link.href) || pendingHref === link.href;
            return (
              <button
                key={link.href}
                type="button"
                className={active ? "nav-pill active" : "nav-pill"}
                aria-current={active ? "page" : undefined}
                onPointerDown={() => router.prefetch(link.href)}
                onClick={() => go(link.href)}
              >
                {link.label}
              </button>
            );
          })}
        </nav>
        <div className="top-bar-user">
          <span className="muted hide-sm">{name}</span>
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
      </header>

      <nav className="bottom-nav" aria-label="Mobile">
        {links.map((link) => {
          const active =
            pathname.startsWith(link.href) || pendingHref === link.href;
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
            pathname.startsWith("/quick-add") || pendingHref === "/quick-add"
              ? "bottom-link fab-slot active"
              : "bottom-link fab-slot"
          }
          aria-label="Quick add"
          onPointerDown={() => router.prefetch("/quick-add")}
          onClick={() => go("/quick-add")}
        >
          <span className="fab-mini">+</span>
          Add
        </button>
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
