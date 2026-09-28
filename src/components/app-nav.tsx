"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/budget", label: "Budget" },
  { href: "/transactions", label: "Transactions" },
  { href: "/debt", label: "Debt Tracker" },
  { href: "/settings", label: "Settings" },
];

export function AppNav({ name }: { name?: string | null }) {
  const pathname = usePathname();

  return (
    <header
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        marginBottom: "1.5rem",
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontSize: "0.75rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            fontWeight: 700,
          }}
        >
          Personal finance
        </p>
        <h1
          style={{
            margin: "0.15rem 0 0",
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 650,
          }}
        >
          Ledger
        </h1>
      </div>

      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.35rem",
          background: "white",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 4,
        }}
      >
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: "0.5rem 0.85rem",
                borderRadius: 9,
                fontWeight: 600,
                fontSize: "0.9rem",
                background: active ? "var(--accent)" : "transparent",
                color: active ? "white" : "var(--ink)",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span className="muted" style={{ fontSize: "0.9rem" }}>
          {name}
        </span>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
