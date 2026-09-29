"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertBudgetAmount } from "@/lib/actions";
import { formatINR } from "@/lib/money";
import { useToast } from "@/components/toast";

export type BudgetTableRow = {
  categoryId: string;
  category: string;
  budget: number;
  actual: number;
  difference: number;
};

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 6.5l5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BudgetRow({
  row,
  yearMonth,
}: {
  row: BudgetTableRow;
  yearMonth: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(row.budget.toFixed(2));
  const inputRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  const over = row.budget > 0 && row.actual > row.budget;
  const leftTone =
    row.difference < 0 ? "neg" : row.difference > 0 ? "pos" : "zero";

  useEffect(() => {
    if (!editing) setDraft(row.budget.toFixed(2));
  }, [row.budget, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEdit() {
    setDraft(row.budget.toFixed(2));
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(row.budget.toFixed(2));
    setEditing(false);
  }

  function save() {
    const fd = new FormData();
    fd.set("categoryId", row.categoryId);
    fd.set("yearMonth", yearMonth);
    fd.set("amount", draft);
    startTransition(async () => {
      try {
        await upsertBudgetAmount(fd);
        toast.success(`${row.category} budget saved`);
        setEditing(false);
        router.refresh();
      } catch (err) {
        console.error(err);
        toast.error("Could not save budget");
      }
    });
  }

  return (
    <tr className={over ? "budget-row-over" : undefined}>
      <td className="budget-col-cat">
        <div className="budget-cat">
          <span className="budget-cat-name">{row.category}</span>
          {over ? (
            <span className="budget-over-alert">Overbudget alert</span>
          ) : null}
        </div>
      </td>
      <td className="num budget-col-budget">
        {editing ? (
          <input
            ref={inputRef}
            id={formId}
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={draft}
            disabled={pending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className={`budget-input ${over ? "over" : ""}`}
            aria-label={`${row.category} budget`}
          />
        ) : (
          <span className={`budget-amount ${over ? "neg" : ""}`}>
            {formatINR(row.budget)}
          </span>
        )}
      </td>
      <td className={`num budget-col-actual ${over ? "neg" : ""}`}>
        {formatINR(row.actual)}
      </td>
      <td className="num budget-col-left">
        <span className={`budget-left-pill ${leftTone}`}>
          {row.difference > 0 ? "+" : ""}
          {formatINR(row.difference)}
        </span>
      </td>
      <td className="budget-col-action">
        {editing ? (
          <div className="budget-action-btns">
            <button
              type="button"
              className={`budget-icon-btn save ${over ? "over" : ""}`}
              onClick={save}
              disabled={pending}
              aria-label={`Save ${row.category} budget`}
              title="Save"
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              className="budget-icon-btn cancel"
              onClick={cancelEdit}
              disabled={pending}
              aria-label="Cancel edit"
              title="Cancel"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="budget-icon-btn edit"
            onClick={startEdit}
            aria-label={`Edit ${row.category} budget`}
            title="Edit"
          >
            <EditIcon />
          </button>
        )}
      </td>
    </tr>
  );
}

export function BudgetCategoryTable({
  rows,
  totals,
  yearMonth,
}: {
  rows: BudgetTableRow[];
  totals: { budget: number; actual: number; difference: number };
  yearMonth: string;
}) {
  return (
    <div className="table-wrap">
      <table className="data budget-table">
        <colgroup>
          <col className="budget-col-cat" />
          <col className="budget-col-budget" />
          <col className="budget-col-actual" />
          <col className="budget-col-left" />
          <col className="budget-col-action" />
        </colgroup>
        <thead>
          <tr>
            <th className="budget-col-cat">Category</th>
            <th className="num budget-col-budget">Budget (₹)</th>
            <th className="num budget-col-actual">Actual (₹)</th>
            <th className="num budget-col-left">Left (₹)</th>
            <th className="budget-col-action">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <BudgetRow key={row.categoryId} row={row} yearMonth={yearMonth} />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="budget-col-cat">Totals</td>
            <td className="num budget-col-budget">
              {formatINR(totals.budget)}
            </td>
            <td className="num budget-col-actual">
              {formatINR(totals.actual)}
            </td>
            <td className="num budget-col-left">
              <span
                className={`budget-left-pill ${
                  totals.difference < 0
                    ? "neg"
                    : totals.difference > 0
                      ? "pos"
                      : "zero"
                }`}
              >
                {totals.difference > 0 ? "+" : ""}
                {formatINR(totals.difference)}
              </span>
            </td>
            <td className="budget-col-action">
              <span
                className={`budget-status ${
                  totals.difference < 0 ? "neg" : "ok"
                }`}
              >
                {totals.difference < 0
                  ? "Over"
                  : totals.difference === 0
                    ? "Balanced"
                    : "Under"}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
