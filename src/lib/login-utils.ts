const APP_PREFIXES = [
  "/overview",
  "/debt",
  "/transactions",
  "/budget",
  "/analytics",
  "/goals",
  "/more",
  "/settings",
  "/quick-add",
];

export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/overview";
  }
  if (raw === "/") return "/overview";
  if (
    APP_PREFIXES.some(
      (p) => raw === p || raw.startsWith(`${p}/`) || raw.startsWith(`${p}?`),
    )
  ) {
    return raw;
  }
  return "/overview";
}

export type LoginState = { error?: string } | undefined;
