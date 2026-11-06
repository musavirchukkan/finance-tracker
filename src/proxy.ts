import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const publicPaths = ["/login", "/signup", "/health"];

/**
 * Next.js 16+: `proxy` replaces the deprecated `middleware` file convention.
 * Auth gate for protected routes (same logic as before).
 */
export const proxy = auth((request) => {
  const { pathname } = request.nextUrl;

  // Static assets only — do not treat any path with "." as public (M4).
  const isStaticAsset =
    /\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|map|txt|xml|webmanifest|woff2?)$/i.test(
      pathname,
    );

  // /api/cron uses CRON_SECRET inside the route (not session auth).
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/monitoring") ||
    pathname.startsWith("/sentry-tunnel") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    isStaticAsset
  ) {
    return NextResponse.next();
  }

  const isPublic = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isLoggedIn = !!request.auth?.user?.id;

  if (!isLoggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const appPaths = [
      "/overview",
      "/debt",
      "/cards",
      "/accounts",
      "/wealth",
      "/transactions",
      "/budget",
      "/analytics",
      "/goals",
      "/more",
      "/settings",
      "/activity",
      "/quick-add",
    ];
    const safeReturn =
      pathname === "/" ||
      appPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
        ? pathname === "/"
          ? "/overview"
          : pathname
        : "/overview";
    url.searchParams.set("callbackUrl", safeReturn);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/overview";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
