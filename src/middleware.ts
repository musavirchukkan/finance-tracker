import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const publicPaths = ["/login", "/health"];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const isPublic = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isLoggedIn = !!request.auth;

  if (!isLoggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const appPaths = [
      "/budget",
      "/transactions",
      "/debt",
      "/settings",
      "/quick-add",
    ];
    const safeReturn =
      pathname === "/" ||
      appPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
        ? pathname === "/"
          ? "/budget"
          : pathname
        : "/budget";
    url.searchParams.set("callbackUrl", safeReturn);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/budget";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
