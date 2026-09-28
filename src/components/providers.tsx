"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/toast";
import { syncPendingTransactions } from "@/lib/offline-queue";

function OfflineSync() {
  useEffect(() => {
    const run = () => {
      void syncPendingTransactions();
    };
    // Only sync on reconnect — form also syncs but shares a mutex
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);
  return null;
}

function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js").then((reg) => {
      void reg.update();
    });
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <ServiceWorkerRegister />
        <OfflineSync />
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}
