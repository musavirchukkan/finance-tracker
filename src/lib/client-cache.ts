/** Client-only helpers for PWA cache / offline maintenance. */

/** Clear service worker + Cache Storage only. Keeps IndexedDB pending sync. */
export async function purgeAppCaches(): Promise<void> {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(
          (k) =>
            k.includes("pages") ||
            k.includes("shell") ||
            k.includes("static") ||
            k.startsWith("ledger-"),
        )
        .map((k) => caches.delete(k)),
    );
  }
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.active?.postMessage({ type: "CLEAR_CACHES" });
  }
}

/** Wipe offline queue DB entirely (used on sign-out). */
export async function clearOfflineDatabase(): Promise<void> {
  const dbReq = indexedDB.deleteDatabase("ledger-offline");
  await new Promise<void>((resolve) => {
    dbReq.onsuccess = () => resolve();
    dbReq.onerror = () => resolve();
    dbReq.onblocked = () => resolve();
  });
}

/** Sign-out cleanup: caches + offline DB. */
export async function clearClientState(): Promise<void> {
  try {
    await purgeAppCaches();
    await clearOfflineDatabase();
  } catch {
    /* ignore */
  }
}
