"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { syncPendingTransactions } from "@/lib/offline-queue";

function OfflineSync() {
  useEffect(() => {
    const run = () => {
      void syncPendingTransactions();
    };
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);
  return null;
}

function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore in dev if blocked */
      });
    }
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ServiceWorkerRegister />
      <OfflineSync />
      {children}
    </SessionProvider>
  );
}
