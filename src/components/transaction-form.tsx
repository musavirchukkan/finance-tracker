"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listPendingTransactions,
  queueTransaction,
  syncPendingTransactions,
  type PendingTransaction,
} from "@/lib/offline-queue";

export type CategoryOption = {
  id: string;
  name: string;
  kind: string;
};

type Props = {
  categories: CategoryOption[];
  defaultDate?: string;
  compact?: boolean;
  onSaved?: () => void;
};

export function TransactionForm({
  categories,
  defaultDate,
  compact,
  onSaved,
}: Props) {
  const router = useRouter();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [status, setStatus] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(
    () => categories.filter((c) => c.kind === type),
    [categories, type],
  );

  async function refreshPending() {
    try {
      const rows = await listPendingTransactions();
      setPendingCount(rows.length);
    } catch {
      setPendingCount(0);
    }
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshPending();

    const onOnline = () => {
      setOnline(true);
      void (async () => {
        const result = await syncPendingTransactions();
        await refreshPending();
        if (result.synced > 0) {
          setStatus(`Synced ${result.synced} offline transaction(s).`);
          router.refresh();
        }
      })();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      date: String(fd.get("date") ?? ""),
      description: String(fd.get("description") ?? "").trim(),
      categoryId: String(fd.get("categoryId") ?? ""),
      type,
      amount: Number(String(fd.get("amount") ?? "0")),
    };

    if (!payload.date || !payload.description || !payload.categoryId) {
      setStatus("Fill all fields.");
      return;
    }

    if (!navigator.onLine) {
      await queueTransaction(payload);
      form.reset();
      setStatus("Saved offline — will sync when you're back online.");
      await refreshPending();
      onSaved?.();
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          // Network flake — queue locally
          await queueTransaction(payload);
          setStatus("Network issue — queued offline.");
          await refreshPending();
        } else {
          form.reset();
          setStatus(type === "income" ? "Income added." : "Expense added.");
          router.refresh();
          onSaved?.();
        }
      } catch {
        await queueTransaction(payload);
        setStatus("Saved offline — will sync when online.");
        await refreshPending();
        onSaved?.();
      }
    });
  }

  return (
    <div>
      {!online ? (
        <p className="offline-banner">You're offline. New entries will sync later.</p>
      ) : null}
      {pendingCount > 0 ? (
        <p className="pending-banner">
          {pendingCount} transaction(s) waiting to sync.
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginLeft: 8, padding: "0.25rem 0.5rem" }}
            onClick={() =>
              startTransition(async () => {
                const r = await syncPendingTransactions();
                await refreshPending();
                if (r.synced) {
                  setStatus(`Synced ${r.synced}.`);
                  router.refresh();
                }
              })
            }
          >
            Sync now
          </button>
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className={compact ? "form-stack" : "form-row"}>
        <div className="type-toggle" role="group" aria-label="Transaction type">
          <button
            type="button"
            className={type === "expense" ? "active expense" : ""}
            onClick={() => setType("expense")}
          >
            Expense
          </button>
          <button
            type="button"
            className={type === "income" ? "active income" : ""}
            onClick={() => setType("income")}
          >
            Income
          </button>
        </div>

        <div className="field">
          <label htmlFor="tx-date">Date</label>
          <input
            id="tx-date"
            name="date"
            type="date"
            required
            defaultValue={defaultDate ?? new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="field" style={{ gridColumn: compact ? undefined : "span 2" }}>
          <label htmlFor="tx-desc">Description</label>
          <input
            id="tx-desc"
            name="description"
            required
            placeholder={type === "income" ? "Salary" : "Groceries"}
          />
        </div>
        <div className="field">
          <label htmlFor="tx-cat">Category</label>
          <select
            id="tx-cat"
            name="categoryId"
            required
            key={type}
            defaultValue={filtered[0]?.id}
          >
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-amount">Amount (₹)</label>
          <input
            id="tx-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={isPending}>
          {isPending ? "Saving…" : type === "income" ? "Add income" : "Add expense"}
        </button>
      </form>
      {status ? <p className="form-status muted">{status}</p> : null}
    </div>
  );
}

export function PendingList({ initial }: { initial?: PendingTransaction[] }) {
  const [rows, setRows] = useState(initial ?? []);
  useEffect(() => {
    void listPendingTransactions().then(setRows);
  }, []);
  if (rows.length === 0) return null;
  return (
    <ul className="pending-list">
      {rows.map((r) => (
        <li key={r.clientId}>
          <strong>{r.type}</strong> {r.description} — ₹{r.amount.toFixed(2)} ({r.date})
        </li>
      ))}
    </ul>
  );
}
