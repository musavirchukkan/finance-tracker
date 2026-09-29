"use client";

import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { purgeAppCaches } from "@/lib/client-cache";
import {
  clearPendingQueue,
  listPendingTransactions,
  syncPendingTransactions,
} from "@/lib/offline-queue";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function IconPhone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="7"
        y="2"
        width="10"
        height="20"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M11 18h2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLaptop() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M2 18h20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconInstall() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v10M8 9l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PwaInstallCard() {
  const toast = useToast();
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [pending, startTransition] = useTransition();

  async function refreshPending() {
    try {
      const rows = await listPendingTransactions();
      setPendingCount(rows.length);
    } catch {
      setPendingCount(0);
    }
  }

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());
    setOnline(navigator.onLine);
    void refreshPending();

    const onOnline = () => {
      setOnline(true);
      void (async () => {
        const result = await syncPendingTransactions();
        await refreshPending();
        if (result.synced > 0) {
          toast.success(`Synced ${result.synced} offline transaction(s)`);
        }
      })();
    };
    const onOffline = () => setOnline(false);

    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onBip);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onBip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted") {
      setInstalled(true);
      toast.success("Ledger installed");
    }
  }

  function handlePurgeCache() {
    if (
      !window.confirm(
        "Clear cached app files? Your unsynced offline transactions will be kept.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await purgeAppCaches();
        toast.success("App cache cleared");
      } catch {
        toast.error("Could not clear cache");
      }
    });
  }

  function handleClearPending() {
    if (pendingCount === 0) {
      toast.info("No pending offline transactions");
      return;
    }
    if (
      !window.confirm(
        `Discard ${pendingCount} unsynced offline transaction${pendingCount === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const n = await clearPendingQueue();
        await refreshPending();
        toast.success(
          n === 0
            ? "Queue already empty"
            : `Cleared ${n} pending transaction${n === 1 ? "" : "s"}`,
        );
      } catch {
        toast.error("Could not clear pending sync");
      }
    });
  }

  const statusParts = [
    online ? "Online" : "Offline",
    `${pendingCount} unsynced`,
    installed ? "Running as app" : "Browser tab",
  ];

  return (
    <section className="panel pwa-card">
      <div className="pwa-card-head">
        <div className="pwa-card-intro">
          <span className="pwa-card-icon" aria-hidden>
            <IconPhone />
          </span>
          <div>
            <div className="pwa-card-title-row">
              <h2>Install as app</h2>
              <span className="pwa-badge">Works offline</span>
            </div>
            <p className="muted page-sub" style={{ margin: "0.35rem 0 0" }}>
              Add Ledger to your home screen or dock for faster access and
              offline capture.
            </p>
          </div>
        </div>
        {installed ? (
          <span className="chip">Installed</span>
        ) : installEvent ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleInstall()}
            disabled={pending}
          >
            <IconInstall />
            Install Ledger
          </button>
        ) : ios ? (
          <span className="chip">Use Share → Add to Home Screen</span>
        ) : (
          <span className="chip">Install via browser menu when available</span>
        )}
      </div>

      <div className="pwa-tips">
        <article className="pwa-tip">
          <span className="pwa-tip-icon" aria-hidden>
            <IconPhone />
          </span>
          <div>
            <h3>Apple iOS / Safari</h3>
            <p>
              Tap Share → <strong>Add to Home Screen</strong> for Ledger.
              For a dedicated Quick Add icon, open <strong>Add</strong> in the
              app first, then Share → Add to Home Screen again (named Quick
              Add).
            </p>
          </div>
        </article>
        <article className="pwa-tip">
          <span className="pwa-tip-icon" aria-hidden>
            <IconLaptop />
          </span>
          <div>
            <h3>Android &amp; Desktop</h3>
            <p>
              Use <strong>Install Ledger</strong> when offered. On Android,
              long-press the Ledger icon → <strong>Quick add</strong> for a
              home-screen shortcut straight to Add.
            </p>
          </div>
        </article>
      </div>

      <div className="pwa-card-foot">
        <p className="pwa-status">
          <span
            className={`pwa-status-dot ${online ? "on" : "off"}`}
            aria-hidden
          />
          {statusParts.join(" · ")}
        </p>
        <div className="pwa-actions">
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={handlePurgeCache}
            disabled={pending}
          >
            Purge cache
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={handleClearPending}
            disabled={pending}
          >
            Clear pending sync
            {pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        </div>
      </div>
    </section>
  );
}
