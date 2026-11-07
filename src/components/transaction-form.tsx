"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import {
  listPendingTransactions,
  queueTransaction,
  syncPendingTransactions,
} from "@/lib/offline-queue";
import { formatINR } from "@/lib/money";
import { resolveCategoryIcon } from "@/lib/category-icons";
import {
  updateTransaction,
} from "@/lib/transaction-actions";
import { clientErrorMessage } from "@/lib/safe-error";
import {
  localWallClockToUtcIso,
  nowTimeLocal,
  todayLocal,
  utcIsoToLocalFields,
} from "@/lib/utc-time";

export type CategoryOption = {
  id: string;
  name: string;
  kind: string;
  icon?: string | null;
};

export type CreditCardOption = {
  id: string;
  name: string;
  /** Display label with last-4 when available. */
  label?: string;
  isRupay?: boolean;
};

export type BankAccountOption = {
  id: string;
  name: string;
  /** Display label with last-4 when available. */
  label?: string;
};

export type TransactionEditValues = {
  id: string;
  /** UTC ISO instant. */
  occurredAt: string;
  /** Calendar day stored for this row (YYYY-MM-DD). */
  date: string;
  description: string;
  categoryId: string;
  type: "expense" | "income" | "transfer";
  amount: string;
  creditCardId: string | null;
  bankAccountId: string | null;
  transferToBankAccountId?: string | null;
  cardBillPayId: string | null;
};

type Props = {
  categories: CategoryOption[];
  creditCards?: CreditCardOption[];
  bankAccounts?: BankAccountOption[];
  defaultDate?: string;
  /** Existing transaction. Date and time are shown in the user's local zone. */
  editing?: TransactionEditValues;
  /** Polished quick-add layout (modal + /quick-add) */
  variant?: "classic" | "quick";
  /** @deprecated use variant="quick" */
  compact?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  title?: string;
};

function formatTimeLabel(date: string, time: string, isToday: boolean) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  const clock = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (isToday && date === todayLocal()) return `Today, ${clock}`;
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  const day = new Date(year, (month || 1) - 1, dayOfMonth || 1).toLocaleDateString(
    undefined,
    {
      day: "numeric",
      month: "short",
    },
  );
  return `${day}, ${clock}`;
}

function QuickCategoryPicker({
  options,
  value,
  onChange,
}: {
  options: CategoryOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((c) => c.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="qa-select-wrap qa-category-picker" ref={rootRef}>
      <button
        type="button"
        className="qa-category-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="qa-select-icon" aria-hidden>
          {selected
            ? resolveCategoryIcon(selected.name, selected.icon)
            : "📁"}
        </span>
        <span className="qa-category-label">
          {selected?.name ?? "Pick a category"}
        </span>
        <span className="qa-category-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <ul
          id={listId}
          className="qa-category-menu"
          role="listbox"
          aria-label="Category"
        >
          {options.length === 0 ? (
            <li className="qa-category-empty muted">No categories yet</li>
          ) : (
            options.map((c) => {
              const active = c.id === value;
              return (
                <li key={c.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={
                      active
                        ? "qa-category-option active"
                        : "qa-category-option"
                    }
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <span className="qa-select-icon" aria-hidden>
                      {resolveCategoryIcon(c.name, c.icon)}
                    </span>
                    <span>{c.name}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

type PaymentMethod = "cash" | "upi" | "bank" | "card" | "pay";

function paymentFromEdit(editing?: TransactionEditValues): {
  paymentMethod: PaymentMethod;
  bankAccountId: string;
  cardId: string;
} {
  if (editing?.cardBillPayId) {
    return {
      paymentMethod: "pay",
      bankAccountId: editing.bankAccountId ?? "",
      cardId: editing.cardBillPayId,
    };
  }
  if (editing?.creditCardId) {
    return {
      paymentMethod: "card",
      bankAccountId: "",
      cardId: editing.creditCardId,
    };
  }
  if (editing?.bankAccountId) {
    return {
      paymentMethod: "bank",
      bankAccountId: editing.bankAccountId,
      cardId: "",
    };
  }
  return { paymentMethod: "cash", bankAccountId: "", cardId: "" };
}

function amountInputValue(amount: string) {
  const n = Number(amount);
  return Number.isFinite(n) ? String(n) : amount;
}

export function TransactionForm({
  categories,
  creditCards = [],
  bankAccounts = [],
  defaultDate,
  editing,
  variant,
  compact,
  onSaved,
  onCancel,
}: Props) {
  const mode = variant ?? (compact ? "quick" : "classic");
  const router = useRouter();
  const toast = useToast();
  const initialPayment = paymentFromEdit(editing);
  const initialWhen = editing
    ? utcIsoToLocalFields(editing.occurredAt) ?? {
        date: editing.date,
        time: "12:00",
      }
    : null;
  const [type, setType] = useState<"expense" | "income" | "transfer">(
    editing?.type ?? "expense",
  );
  const [amount, setAmount] = useState(
    editing ? amountInputValue(editing.amount) : "",
  );
  const [description, setDescription] = useState(editing?.description ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialPayment.paymentMethod,
  );
  const [bankAccountId, setBankAccountId] = useState(() => {
    if (editing?.type === "transfer") {
      return editing.bankAccountId ?? "cash";
    }
    return initialPayment.bankAccountId;
  });
  /** Transfer To leg: "" = unset, "cash" = Cash, uuid = bank. */
  const [transferToBankAccountId, setTransferToBankAccountId] = useState(() => {
    if (editing?.type === "transfer") {
      return editing.transferToBankAccountId ?? "cash";
    }
    return "";
  });
  const [cardId, setCardId] = useState(initialPayment.cardId);
  const saveLock = useRef(false);
  const [categoryId, setCategoryId] = useState(
    () =>
      editing?.categoryId ??
      categories.find((c) => c.kind === "expense")?.id ??
      "",
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(() =>
    typeof window !== "undefined" ? navigator.onLine : true,
  );
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [editWhen, setEditWhen] = useState(Boolean(editing));
  const [dateValue, setDateValue] = useState(
    initialWhen?.date ?? defaultDate ?? "",
  );
  const [timeValue, setTimeValue] = useState(initialWhen?.time ?? "");
  const clockReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => Boolean(editing),
  );

  const filtered = useMemo(
    () =>
      type === "transfer"
        ? categories.filter((c) => c.kind === "transfer")
        : categories.filter((c) => c.kind === type),
    [categories, type],
  );

  const selectedCategoryId = filtered.some((c) => c.id === categoryId)
    ? categoryId
    : (filtered[0]?.id ?? "");

  function changeType(next: "expense" | "income" | "transfer") {
    setType(next);
    if (next === "transfer") {
      const transferCat = categories.find((c) => c.kind === "transfer");
      setCategoryId(transferCat?.id ?? "");
      setPaymentMethod("cash");
      setCardId("");
      // Force explicit From/To picks — do not default either leg to Cash.
      setBankAccountId("");
      setTransferToBankAccountId("");
      return;
    }
    const nextFiltered = categories.filter((c) => c.kind === next);
    setCategoryId(nextFiltered[0]?.id ?? "");
    setBankAccountId("");
    setTransferToBankAccountId("");
    if (next === "income") {
      setPaymentMethod("cash");
      setCardId("");
    }
  }

  function changePaymentMethod(next: PaymentMethod) {
    setPaymentMethod(next);
    setBankAccountId("");
    setCardId("");
  }

  /** UPI / POS can be linked to a bank account or a credit card. */
  const dualSourceValue = bankAccountId
    ? `bank:${bankAccountId}`
    : cardId
      ? `card:${cardId}`
      : "";

  function setDualSource(value: string) {
    if (value.startsWith("bank:")) {
      setBankAccountId(value.slice(5));
      setCardId("");
    } else if (value.startsWith("card:")) {
      setCardId(value.slice(5));
      setBankAccountId("");
    } else {
      setBankAccountId("");
      setCardId("");
    }
  }

  const needsBankAccount =
    paymentMethod === "bank" || paymentMethod === "pay";
  /** Pay bill always needs a credit card; POS uses dual source below. */
  const needsCard = type === "expense" && paymentMethod === "pay";
  const needsUpiSource = paymentMethod === "upi";
  /** POS swipe: debit from bank (for now) or charge a credit card. */
  const needsPosSource = type === "expense" && paymentMethod === "card";
  const rupayCards = creditCards.filter((c) => c.isRupay);
  const showUpiOption =
    bankAccounts.length > 0 || (type === "expense" && rupayCards.length > 0);
  const showPosOption =
    type === "expense" &&
    (bankAccounts.length > 0 || creditCards.length > 0);

  function cardLabel(c: CreditCardOption) {
    return c.label ?? c.name;
  }

  function bankLabel(a: BankAccountOption) {
    return a.label ?? a.name;
  }

  async function refreshPending() {
    try {
      const rows = await listPendingTransactions();
      setPendingCount(rows.length);
    } catch {
      setPendingCount(0);
    }
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refreshPending();
    });

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
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setAmount("");
    setDescription("");
    setPaymentMethod("cash");
    setBankAccountId("");
    setTransferToBankAccountId("");
    setCardId("");
    setDateValue(todayLocal());
    setTimeValue(nowTimeLocal());
    setEditWhen(false);
  }

  function bumpAmount(delta: number) {
    const current = Number(amount) || 0;
    setAmount(String(Math.max(0, Math.round((current + delta) * 100) / 100)));
  }

  async function save() {
    if (saveLock.current || saving) return;
    saveLock.current = true;
    setSaving(true);
    try {
      await saveInner();
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function saveInner() {
    const date = editing || editWhen ? dateValue : todayLocal();
    const time = editing || editWhen ? timeValue : nowTimeLocal();
    const occurredAt = localWallClockToUtcIso(date, time);
    if (!occurredAt) {
      toast.error("Enter a valid date and time");
      return;
    }
    const clientId = crypto.randomUUID();
    const amountNum = Number(amount);

    if (!amountNum || amountNum <= 0) {
      toast.error("Enter a positive amount");
      return;
    }

    if (type === "transfer") {
      // "" = not chosen; "cash" = Cash; uuid = bank. Both legs required.
      if (!bankAccountId || !transferToBankAccountId) {
        toast.error("Choose both From and To");
        return;
      }
      const fromId = bankAccountId === "cash" ? null : bankAccountId;
      const toId =
        transferToBankAccountId === "cash" ? null : transferToBankAccountId;
      if (!fromId && !toId) {
        toast.error("Cash to Cash is not allowed");
        return;
      }
      if (fromId && toId && fromId === toId) {
        toast.error("From and To must be different accounts");
        return;
      }

      if (editing) {
        if (!navigator.onLine) {
          toast.error("You're offline — connect to save changes");
          return;
        }
        const fd = new FormData();
        fd.set("id", editing.id);
        fd.set("date", date);
        fd.set("occurredAt", occurredAt);
        fd.set("description", description.trim());
        fd.set("categoryId", selectedCategoryId);
        fd.set("type", "transfer");
        fd.set("amount", String(amountNum));
        fd.set("creditCardId", "");
        fd.set("cardBillPayId", "");
        fd.set("bankAccountId", fromId ?? "");
        fd.set("transferToBankAccountId", toId ?? "");
        try {
          await updateTransaction(fd);
          toast.success("Transfer updated");
          router.refresh();
          onSaved?.();
        } catch (err) {
          toast.error(clientErrorMessage(err, "Could not update transfer"));
        }
        return;
      }

      const payload = {
        clientId,
        date,
        occurredAt,
        description: description.trim(),
        categoryId: selectedCategoryId,
        type: "transfer" as const,
        amount: amountNum,
        creditCardId: null,
        cardBillPayId: null,
        bankAccountId: fromId,
        transferToBankAccountId: toId,
      };

      if (!navigator.onLine) {
        await queueTransaction(payload);
        resetForm();
        toast.info("Saved offline — will sync when you're back online");
        await refreshPending();
        onSaved?.();
        return;
      }

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
          toast.success("Transfer added");
          router.refresh();
          onSaved?.();
        }
      } catch {
        await queueTransaction(payload);
        toast.info("Saved offline — will sync when online");
        await refreshPending();
        onSaved?.();
      }
      return;
    }

    if (!selectedCategoryId) {
      toast.error("Pick a category");
      return;
    }

    if (needsBankAccount && !bankAccountId) {
      toast.error("Choose the bank account");
      return;
    }
    if (needsCard && !cardId) {
      toast.error("Choose the card to pay");
      return;
    }
    if (paymentMethod === "upi" && !bankAccountId && !cardId) {
      toast.error("Choose the UPI account or card");
      return;
    }
    if (needsPosSource && !bankAccountId && !cardId) {
      toast.error("Choose the bank account or credit card");
      return;
    }

    const cardSpendId =
      type === "expense" &&
      cardId &&
      (paymentMethod === "card" ||
        (paymentMethod === "upi" && !bankAccountId))
        ? cardId
        : null;

    const cardBillPayId =
      type === "expense" && paymentMethod === "pay" && cardId ? cardId : null;
    const linkedBankAccountId =
      (needsBankAccount ||
        (paymentMethod === "upi" && bankAccountId) ||
        (paymentMethod === "card" && bankAccountId)) &&
      bankAccountId
        ? bankAccountId
        : null;

    if (editing) {
      if (!navigator.onLine) {
        toast.error("You're offline — connect to save changes");
        return;
      }
      const fd = new FormData();
      fd.set("id", editing.id);
      fd.set("date", date);
      fd.set("occurredAt", occurredAt);
      fd.set("description", description.trim());
      fd.set("categoryId", selectedCategoryId);
      fd.set("type", type);
      fd.set("amount", String(amountNum));
      fd.set("creditCardId", cardSpendId ?? "");
      fd.set("cardBillPayId", cardBillPayId ?? "");
      fd.set("bankAccountId", linkedBankAccountId ?? "");
      fd.set("transferToBankAccountId", "");
      try {
        await updateTransaction(fd);
        toast.success("Transaction updated");
        router.refresh();
        onSaved?.();
      } catch (err) {
        toast.error(clientErrorMessage(err, "Could not update transaction"));
      }
      return;
    }

    const payload = {
      clientId,
      date,
      occurredAt,
      description: description.trim(),
      categoryId: selectedCategoryId,
      type,
      amount: amountNum,
      creditCardId: cardSpendId,
      cardBillPayId,
      bankAccountId: linkedBankAccountId,
      transferToBankAccountId: null,
    };

    if (!navigator.onLine) {
      await queueTransaction(payload);
      resetForm();
      toast.info("Saved offline — will sync when you're back online");
      await refreshPending();
      onSaved?.();
      return;
    }

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
  }

  const amountNum = Number(amount) || 0;
  const timeLabel =
    !editing && !clockReady
      ? "Now"
      : formatTimeLabel(
          editing || editWhen ? dateValue : todayLocal(),
          editing || editWhen ? timeValue : nowTimeLocal(),
          !editing && !editWhen,
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
            onClick={() => changeType("expense")}
          >
            <span aria-hidden>↓</span> Expense
          </button>
          <button
            type="button"
            className={type === "income" ? "qa-type-btn active income" : "qa-type-btn"}
            aria-pressed={type === "income"}
            onClick={() => changeType("income")}
          >
            <span aria-hidden>↑</span> Income
          </button>
          <button
            type="button"
            className={
              type === "transfer" ? "qa-type-btn active transfer" : "qa-type-btn"
            }
            aria-pressed={type === "transfer"}
            onClick={() => changeType("transfer")}
          >
            <span aria-hidden>⇄</span> Transfer
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
                type === "transfer"
                  ? "e.g. Cash deposit / self transfer"
                  : type === "income"
                    ? "e.g. January salary"
                    : "e.g. Auto to Bandra Station"
              }
              autoComplete="off"
            />
          </div>
        </div>

        {type !== "transfer" ? (
          <div className="qa-field">
            <span className="qa-label">Category</span>
            <QuickCategoryPicker
              options={filtered}
              value={selectedCategoryId}
              onChange={setCategoryId}
            />
          </div>
        ) : null}

        {type === "transfer" ? (
          <>
            <div className="qa-field">
              <span className="qa-label">From</span>
              <select
                className="qa-select"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                aria-label="Transfer from"
                required
              >
                <option value="" disabled>
                  Choose…
                </option>
                <option value="cash">Cash</option>
                {bankAccounts.map((a) => (
                  <option key={`from-${a.id}`} value={a.id}>
                    {bankLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <div className="qa-field">
              <span className="qa-label">To</span>
              <select
                className="qa-select"
                value={transferToBankAccountId}
                onChange={(e) => setTransferToBankAccountId(e.target.value)}
                aria-label="Transfer to"
                required
              >
                <option value="" disabled>
                  Choose…
                </option>
                <option value="cash">Cash</option>
                {bankAccounts.map((a) => (
                  <option key={`to-${a.id}`} value={a.id}>
                    {bankLabel(a)}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="qa-field">
            <span className="qa-label">
              {type === "income" ? "Received how" : "Paid how"}
            </span>
            <select
              className="qa-select"
              value={paymentMethod}
              onChange={(e) =>
                changePaymentMethod(e.target.value as PaymentMethod)
              }
              aria-label={type === "income" ? "Received how" : "Paid how"}
            >
              <option value="cash">Cash</option>
              {showUpiOption ? <option value="upi">UPI</option> : null}
              {bankAccounts.length > 0 ? (
                <option value="bank">Bank transfer</option>
              ) : null}
              {showPosOption ? (
                <option value="card">Card swipe / POS</option>
              ) : null}
              {type === "expense" && creditCards.length > 0 ? (
                <option value="pay">Pay card bill</option>
              ) : null}
            </select>
          </div>
        )}

        {type !== "transfer" && needsUpiSource ? (
          <div className="qa-field">
            <span className="qa-label">
              {type === "income" ? "Into account" : "UPI from"}
            </span>
            <select
              className="qa-select"
              value={dualSourceValue}
              onChange={(e) => setDualSource(e.target.value)}
              aria-label={type === "income" ? "Into account" : "UPI from"}
              required
            >
              <option value="" disabled>
                {type === "income"
                  ? "Choose account…"
                  : "Choose bank or card…"}
              </option>
              {bankAccounts.map((a) => (
                <option key={`upi-bank-${a.id}`} value={`bank:${a.id}`}>
                  Bank · {bankLabel(a)}
                </option>
              ))}
              {type === "expense"
                ? rupayCards.map((c) => (
                    <option key={`upi-card-${c.id}`} value={`card:${c.id}`}>
                      RuPay · {cardLabel(c)}
                    </option>
                  ))
                : null}
            </select>
          </div>
        ) : null}

        {type !== "transfer" && needsPosSource ? (
          <div className="qa-field">
            <span className="qa-label">Paid with</span>
            <select
              className="qa-select"
              value={dualSourceValue}
              onChange={(e) => setDualSource(e.target.value)}
              aria-label="POS payment source"
              required
            >
              <option value="" disabled>
                Choose bank or credit card…
              </option>
              {bankAccounts.map((a) => (
                <option key={`pos-bank-${a.id}`} value={`bank:${a.id}`}>
                  Bank · {bankLabel(a)}
                </option>
              ))}
              {creditCards.map((c) => (
                <option key={`pos-card-${c.id}`} value={`card:${c.id}`}>
                  Credit · {cardLabel(c)}
                  {c.isRupay ? " (RuPay)" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {type !== "transfer" && needsCard ? (
          <div className="qa-field">
            <span className="qa-label">Credit card</span>
            <select
              className="qa-select"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              aria-label="Credit card"
              required
            >
              <option value="" disabled>
                Choose card…
              </option>
              {creditCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {cardLabel(c)}
                  {c.isRupay ? " (RuPay)" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {type !== "transfer" &&
        (needsBankAccount ||
          (type === "income" &&
            paymentMethod !== "upi" &&
            bankAccounts.length > 0)) ? (
          <div className="qa-field">
            <span className="qa-label">
              {type === "income"
                ? "Into account"
                : paymentMethod === "pay"
                  ? "Pay from account"
                  : "Account"}
            </span>
            <select
              className="qa-select"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              aria-label="Bank account"
              required={needsBankAccount}
            >
              <option value="" disabled={needsBankAccount}>
                {needsBankAccount
                  ? bankAccounts.length === 0
                    ? "Add a bank account first…"
                    : "Choose account…"
                  : "Optional"}
              </option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {bankLabel(a)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="qa-meta">
          <div className="qa-meta-card">
            <span className="qa-label">Time</span>
            {editing ? (
              <span className="qa-time-btn">
                <span aria-hidden>🕒</span>
                <span>{timeLabel}</span>
              </span>
            ) : (
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
            )}
            {editing || editWhen ? (
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
          disabled={saving}
          onClick={() => void save()}
        >
          <span className="qa-submit-check" aria-hidden>
            ✓
          </span>
          <span className="qa-submit-label">
            {saving
              ? "Saving…"
              : editing
                ? "Save changes"
                : type === "transfer"
                  ? "Add Transfer"
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
            onClick={() => changeType("expense")}
          >
            Expense
          </button>
          <button
            type="button"
            className={type === "income" ? "active income" : ""}
            onClick={() => changeType("income")}
          >
            Income
          </button>
          <button
            type="button"
            className={type === "transfer" ? "active transfer" : ""}
            onClick={() => changeType("transfer")}
          >
            Transfer
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
            value={selectedCategoryId}
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
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {type === "transfer"
            ? "Add transfer"
            : type === "income"
              ? "Add income"
              : "Add expense"}
        </button>
      </form>
    </div>
  );
}
