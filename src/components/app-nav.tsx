"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/budget", label: "Budget", short: "Budget" },
  { href: "/transactions", label: "Txns", short: "Txns" },
  { href: "/debt", label: "Debt", short: "Debt" },
  { href: "/settings", label: "More", short: "More" },
];

export function AppNav({ name }: { name?: string | null }) {
  const pathname = usePathname();

  return (
    <>
      <header className="top-bar">
        <div>
          <p className="eyebrow">Personal finance</p>
          <h1 className="brand">Ledger</h1>
        </div>
        <nav className="desktop-nav" aria-label="Main">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "nav-pill active" : "nav-pill"}
              >
                {link.label === "Txns" ? "Transactions" : link.label === "More" ? "Settings" : link.label}
              </Link>
            );
          })}
        </nav>
        <div className="top-bar-user">
          <span className="muted hide-sm">{name}</span>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Out
          </button>
        </div>
      </header>

      <nav className="bottom-nav" aria-label="Mobile">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "bottom-link active" : "bottom-link"}
            >
              <span className="bottom-icon" aria-hidden>
                {link.href === "/budget"
                  ? "◉"
                  : link.href === "/transactions"
                    ? "☰"
                    : link.href === "/debt"
                      ? "↘"
                      : "⚙"}
              </span>
              {link.short}
            </Link>
          );
        })}
        <Link href="/quick-add" className="bottom-link fab-slot" aria-label="Quick add">
          <span className="fab-mini">+</span>
          Add
        </Link>
      </nav>

      <Link href="/quick-add" className="fab" aria-label="Quick add transaction">
        +
      </Link>
    </>
  );
}
