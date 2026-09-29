"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import {
  listPendingTransactions,
  queueTransaction,
  syncPendingTransactions,
} from "@/lib/offline-queue";
import { formatINR } from "@/lib/money";
import { resolveCategoryIcon } from "@/lib/category-icons";

export type CategoryOption = {
  id: string;
  name: string;
  kind: string;
  icon?: string | null;
};

type Props = {
  categories: CategoryOption[];
  defaultDate?: string;
  /** Polished quick-add layout (modal + /quick-add) */
  variant?: "classic" | "quick";
  /** @deprecated use variant="quick" */
  compact?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  title?: string;
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

function formatTimeLabel(date: string, time: string, isToday: boolean) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  const clock = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (isToday && date === todayLocal()) return `Today, ${clock}`;
  const day = new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  return `${day}, ${clock}`;
}

export function TransactionForm({
  categories,
  defaultDate,
  variant,
  compact,
  onSaved,
  onCancel,
  title = "Quick Add",
}: Props) {
  const mode = variant ?? (compact ? "quick" : "classic");
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
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

  useEffect(() => {
    if (!filtered.some((c) => c.id === categoryId)) {
      setCategoryId(filtered[0]?.id ?? "");
    }
  }, [filtered, categoryId]);

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

  function resetForm() {
    setAmount("");
    setDescription("");
    setDateValue(todayLocal());
    setTimeValue(nowTimeLocal());
    setEditWhen(false);
  }

  function bumpAmount(delta: number) {
    const current = Number(amount) || 0;
    setAmount(String(Math.max(0, Math.round((current + delta) * 100) / 100)));
  }

  async function save() {
    const date = editWhen ? dateValue : todayLocal();
    const time = editWhen ? timeValue : nowTimeLocal();
    const occurredAt = new Date(`${date}T${time}:00`).toISOString();
    const clientId = crypto.randomUUID();
    const amountNum = Number(amount);

    if (!categoryId) {
      toast.error("Pick a category");
      return;
    }
    if (!amountNum || amountNum <= 0) {
      toast.error("Enter an amount");
      return;
    }

    const payload = {
      clientId,
      date,
      occurredAt,
      description: description.trim(),
      categoryId,
      type,
      amount: amountNum,
    };

    if (!navigator.onLine) {
      await queueTransaction(payload);
      resetForm();
      toast.info("Saved offline — will sync when you're back online");
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
          resetForm();
          toast.success(type === "income" ? "Income added" : "Expense added");
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

  const amountNum = Number(amount) || 0;
  const selectedCat = filtered.find((c) => c.id === categoryId);
  const timeLabel = formatTimeLabel(
    editWhen ? dateValue : todayLocal(),
    editWhen ? timeValue : nowTimeLocal(),
    !editWhen,
  );

  if (mode === "quick") {
    return (
      <div className="qa">
        {onCancel ? (
          <div className="qa-head qa-head-end">
            <button
              type="button"
              className="icon-btn"
              aria-label="Close"
              onClick={onCancel}
            >
              ×
            </button>
          </div>
        ) : null}

        {!online ? (
          <p className="offline-banner">You&apos;re offline — entries sync later.</p>
        ) : null}
        {pendingCount > 0 ? (
          <p className="pending-banner">
            {pendingCount} waiting to sync.{" "}
            <button
              type="button"
              className="linkish"
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

        <div className="qa-type" role="group" aria-label="Transaction type">
          <button
            type="button"
            className={type === "expense" ? "qa-type-btn active expense" : "qa-type-btn"}
            aria-pressed={type === "expense"}
            onClick={() => setType("expense")}
          >
            <span aria-hidden>↓</span> Expense
          </button>
          <button
            type="button"
            className={type === "income" ? "qa-type-btn active income" : "qa-type-btn"}
            aria-pressed={type === "income"}
            onClick={() => setType("income")}
          >
            <span aria-hidden>↑</span> Income
          </button>
        </div>

        <div className="qa-amount-block">
          <div className="qa-amount-meta">
            <span className="qa-label">Amount</span>
            <span className="qa-currency">INR ₹</span>
          </div>
          <div className="qa-amount-input-wrap">
            <span className="qa-rupee">₹</span>
            <input
              className="qa-amount-input"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value.replace(/[^\d.]/g, ""))
              }
              aria-label="Amount"
              autoFocus
            />
          </div>
          <div className="qa-amount-chips">
            {[100, 500, 1000].map((n) => (
              <button
                key={n}
                type="button"
                className="qa-chip"
                onClick={() => bumpAmount(n)}
              >
                +{n.toLocaleString("en-IN")}
              </button>
            ))}
            <button
              type="button"
              className="qa-chip"
              onClick={() => setAmount("")}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="qa-field">
          <span className="qa-label">Note / merchant</span>
          <div className="qa-note-wrap">
            <span className="qa-note-icon" aria-hidden>
              ≡
            </span>
            <input
              className="qa-note-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === "income"
                  ? "e.g. January salary"
                  : "e.g. Auto to Bandra Station"
              }
              autoComplete="off"
            />
          </div>
        </div>

        <div className="qa-field">
          <span className="qa-label">Category</span>
          <div className="qa-select-wrap">
            <span className="qa-select-icon" aria-hidden>
              {selectedCat
                ? resolveCategoryIcon(selectedCat.name, selectedCat.icon)
                : "📁"}
            </span>
            <select
              className="qa-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Category"
              required
            >
              {filtered.length === 0 ? (
                <option value="">No categories yet</option>
              ) : (
                filtered.map((c) => (
                  <option key={c.id} value={c.id}>
                    {resolveCategoryIcon(c.name, c.icon)} {c.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="qa-meta">
          <div className="qa-meta-card">
            <span className="qa-label">Time</span>
            <button
              type="button"
              className="qa-time-btn"
              onClick={() => {
                if (!editWhen) {
                  setDateValue(todayLocal());
                  setTimeValue(nowTimeLocal());
                }
                setEditWhen((v) => !v);
              }}
            >
              <span aria-hidden>🕒</span>
              <span>{timeLabel}</span>
            </button>
            {editWhen ? (
              <div className="when-fields" style={{ marginTop: "0.5rem" }}>
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  aria-label="Date"
                />
                <input
                  type="time"
                  value={timeValue}
                  onChange={(e) => setTimeValue(e.target.value)}
                  aria-label="Time"
                />
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className="qa-submit"
          disabled={isPending}
          onClick={() => void save()}
        >
          <span className="qa-submit-check" aria-hidden>
            ✓
          </span>
          <span className="qa-submit-label">
            {isPending
              ? "Saving…"
              : type === "income"
                ? "Add Income"
                : "Add Expense"}
          </span>
          <span className="qa-submit-amt">
            {amountNum > 0 ? formatINR(amountNum) : "₹0"}
          </span>
        </button>
      </div>
    );
  }

  // Classic fallback (unused by modal/quick-add now)
  return (
    <div>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
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
          <label htmlFor="tx-amount">Amount (₹)</label>
          <input
            id="tx-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="tx-cat">Category</label>
          <select
            id="tx-cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
          >
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>
                {resolveCategoryIcon(c.name, c.icon)} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-desc">Description (optional)</label>
          <input
            id="tx-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={isPending}>
          {type === "income" ? "Add income" : "Add expense"}
        </button>
      </form>
    </div>
  );
}
