const STATIC_CACHE = "ledger-static-v6";
const PAGE_CACHE = "ledger-pages-v6";

const STATIC_PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

/** Routes that contain user-specific data — only serve from cache if logged in. */
const PROTECTED_PREFIXES = [
  "/overview",
  "/debt",
  "/wealth",
  "/cards",
  "/accounts",
  "/transactions",
  "/budget",
  "/analytics",
  "/goals",
  "/settings",
  "/quick-add",
  "/more",
];

/** Last session cookie fingerprint seen by this SW — clears pages on user change. */
let lastSessionFp = null;

function isProtectedPath(pathname) {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`),
  );
}

/**
 * Hash the full session cookie (incl. Auth.js chunked tokens).
 * Do NOT use a short prefix — JWE protected headers are identical across users (H7).
 */
async function sessionCookieFingerprint(request) {
  const cookie = request.headers.get("cookie") || "";
  const re =
    /(?:^|;\s*)(?:__Secure-)?(?:authjs|next-auth)\.session-token(?:\.(\d+))?=([^;]+)/g;
  const chunks = [];
  let m;
  while ((m = re.exec(cookie))) {
    chunks.push({
      idx: m[1] != null ? Number(m[1]) : -1,
      value: m[2],
    });
  }
  if (chunks.length === 0) return "";

  chunks.sort((a, b) => a.idx - b.idx);
  const raw = chunks.map((c) => c.value).join(".");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isNavigate =
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html");

  // --- Authenticated HTML pages (budget, etc.): network-first, cache for offline ---
  if (isNavigate) {
    event.respondWith(handleNavigation(request, url.pathname));
    return;
  }

  // --- Static assets: cache-first ---
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetched = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetched;
      }),
    );
  }
});

async function handleNavigation(request, pathname) {
  const fp = await sessionCookieFingerprint(request);
  if (fp !== lastSessionFp) {
    await clearPageCache();
    lastSessionFp = fp;
  }

  const loggedIn = Boolean(fp);
  const protectedRoute = isProtectedPath(pathname);

  // Logged out → never serve cached budget/data pages
  if (protectedRoute && !loggedIn) {
    await clearPageCache();
    try {
      return await fetch(request);
    } catch {
      const login = await caches.match("/login");
      return (
        login ||
        new Response("Please go online to sign in.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        })
      );
    }
  }

  try {
    const response = await fetch(request);
    // Only cache successful authenticated app pages for offline use
    if (response.ok && loggedIn && protectedRoute) {
      const copy = response.clone();
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, copy);
    }
    // Also keep a fresh /login for logged-out offline
    if (response.ok && pathname === "/login") {
      const copy = response.clone();
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, copy);
    }
    return response;
  } catch {
    // Offline fallback
    if (protectedRoute && loggedIn) {
      const cached = await caches.match(request);
      if (cached) return cached;
      // Any cached budget as last resort for same path family
      const pageCache = await caches.open(PAGE_CACHE);
      const match = await pageCache.match(request);
      if (match) return match;
    }
    if (pathname === "/login" || !loggedIn) {
      const login = await caches.match("/login");
      if (login) return login;
    }
    return new Response("You're offline. Reconnect to load Ledger.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

async function clearPageCache() {
  await caches.delete(PAGE_CACHE);
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_CACHES") {
    lastSessionFp = null;
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                k === STATIC_CACHE ||
                k === PAGE_CACHE ||
                k.startsWith("ledger-") ||
                k.includes("shell") ||
                k.includes("static") ||
                k.includes("pages"),
            )
            .map((k) => caches.delete(k)),
        ),
      ),
    );
  }
  if (event.data?.type === "CLEAR_ALL_CACHES") {
    lastSessionFp = null;
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});
