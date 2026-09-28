"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import {
  listPendingTransactions,
  queueTransaction,
  syncPendingTransactions,
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

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowTimeLocal(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TransactionForm({
  categories,
  defaultDate,
  compact,
  onSaved,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [status, setStatus] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [editWhen, setEditWhen] = useState(false);
  const [dateValue, setDateValue] = useState(defaultDate ?? todayLocal());
  const [timeValue, setTimeValue] = useState(nowTimeLocal());

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
          toast.success(`Synced ${result.synced} offline transaction(s)`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildOccurredAt(date: string, time: string) {
    return new Date(`${date}T${time}:00`).toISOString();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const form = e.currentTarget;
    const fd = new FormData(form);

    // If user didn't open "edit when", refresh time to "now" at submit
    const date = editWhen ? dateValue : todayLocal();
    const time = editWhen ? timeValue : nowTimeLocal();
    const occurredAt = buildOccurredAt(date, time);
    const clientId = crypto.randomUUID();

    const payload = {
      clientId,
      date,
      occurredAt,
      description: String(fd.get("description") ?? "").trim(),
      categoryId: String(fd.get("categoryId") ?? ""),
      type,
      amount: Number(String(fd.get("amount") ?? "0")),
    };

    if (!payload.description || !payload.categoryId) {
      toast.error("Fill all fields");
      return;
    }

    if (!navigator.onLine) {
      await queueTransaction(payload);
      form.reset();
      setDateValue(todayLocal());
      setTimeValue(nowTimeLocal());
      setEditWhen(false);
      toast.info("Saved offline — will sync when you're back online");
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
          await queueTransaction(payload);
          toast.info("Network issue — queued offline");
          await refreshPending();
        } else {
          form.reset();
          setDateValue(todayLocal());
          setTimeValue(nowTimeLocal());
          setEditWhen(false);
          toast.success(type === "income" ? "Income added" : "Expense added");
          setStatus(type === "income" ? "Income added." : "Expense added.");
          router.refresh();
          onSaved?.();
        }
      } catch {
        await queueTransaction(payload);
        toast.info("Saved offline — will sync when online");
        await refreshPending();
        onSaved?.();
      }
    });
  }

  return (
    <div>
      {!online ? (
        <p className="offline-banner">
          You&apos;re offline. New entries will sync later.
        </p>
      ) : null}
      {pendingCount > 0 ? (
        <p className="pending-banner">
          {pendingCount} waiting to sync.
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            style={{ marginLeft: 8 }}
            onClick={() =>
              startTransition(async () => {
                const r = await syncPendingTransactions();
                await refreshPending();
                if (r.synced) {
                  toast.success(`Synced ${r.synced}`);
                  router.refresh();
                }
              })
            }
          >
            Sync now
          </button>
        </p>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className={compact ? "form-stack" : "form-row"}
      >
        <div className="type-toggle" role="group" aria-label="Transaction type">
          <button
            type="button"
            className={type === "expense" ? "active expense" : ""}
            aria-pressed={type === "expense"}
            onClick={() => setType("expense")}
          >
            Expense
          </button>
          <button
            type="button"
            className={type === "income" ? "active income" : ""}
            aria-pressed={type === "income"}
            onClick={() => setType("income")}
          >
            Income
          </button>
        </div>

        <div className="field field-span-2">
          <div className="when-row">
            <span className="when-summary muted">
              {editWhen
                ? `${dateValue} · ${timeValue}`
                : "Today · now (auto)"}
            </span>
            <button
              type="button"
              className="linkish"
              onClick={() => {
                if (!editWhen) {
                  setDateValue(todayLocal());
                  setTimeValue(nowTimeLocal());
                }
                setEditWhen((v) => !v);
              }}
            >
              {editWhen ? "Use now" : "Change date / time"}
            </button>
          </div>
          {editWhen ? (
            <div className="when-fields">
              <div className="field">
                <label htmlFor="tx-date">Date</label>
                <input
                  id="tx-date"
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="tx-time">Time</label>
                <input
                  id="tx-time"
                  type="time"
                  value={timeValue}
                  onChange={(e) => setTimeValue(e.target.value)}
                  required
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="field field-span-2">
          <label htmlFor="tx-desc">Description</label>
          <input
            id="tx-desc"
            name="description"
            required
            placeholder={type === "income" ? "Salary" : "Groceries"}
            autoComplete="off"
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
          {isPending
            ? "Saving…"
            : type === "income"
              ? "Add income"
              : "Add expense"}
        </button>
      </form>
      {status ? <p className="form-status muted">{status}</p> : null}
    </div>
  );
}
