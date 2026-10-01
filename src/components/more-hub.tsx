"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NavIcon } from "@/components/nav-icons";

const moreLinks = [
  {
    href: "/transactions",
    label: "Transactions",
    description: "Browse and edit spending history",
    icon: "list",
  },
  {
    href: "/budget",
    label: "Budget",
    description: "Set limits and track this month",
    icon: "budget",
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Account, theme, categories, and install",
    icon: "settings",
  },
] as const;

export function MoreHub() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function go(href: string) {
    if (pathname.startsWith(href)) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <nav className="more-hub" aria-label="More">
      {moreLinks.map((link) => {
        const active =
          pathname.startsWith(link.href) ||
          (isPending && pendingHref === link.href);
        return (
          <button
            key={link.href}
            type="button"
            className={active ? "more-hub-link active" : "more-hub-link"}
            aria-current={active ? "page" : undefined}
            onPointerDown={() => router.prefetch(link.href)}
            onClick={() => go(link.href)}
          >
            <span className="more-hub-icon">
              <NavIcon name={link.icon} />
            </span>
            <span className="more-hub-copy">
              <strong>{link.label}</strong>
              <span className="muted">{link.description}</span>
            </span>
            <span className="more-hub-chevron" aria-hidden>
              ›
            </span>
          </button>
        );
      })}
    </nav>
  );
}
