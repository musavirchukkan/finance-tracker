"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { CategoryIconPicker } from "@/components/category-icon-picker";
import { Modal } from "@/components/modal";
import {
  TransactionForm,
  type CategoryOption,
} from "@/components/transaction-form";
import { createCategory, updateDebtGoal } from "@/lib/actions";

export function AddCategoryButton({
  defaultKind = "expense",
}: {
  defaultKind?: "expense" | "income";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        + Add category
      </button>
      <Modal open={open} title="Add category" onClose={() => setOpen(false)}>
        <ActionForm
          action={createCategory}
          successMessage="Category added"
          errorMessage="Could not add category"
          className="form-stack"
          resetOnSuccess
          onSuccess={() => setOpen(false)}
        >
          <div className="field">
            <label htmlFor="cat-name">Name</label>
            <input
              id="cat-name"
              name="name"
              required
              placeholder="Subscriptions"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="cat-kind">Type</label>
            <select id="cat-kind" name="kind" defaultValue={defaultKind}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <CategoryIconPicker />
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              Save category
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function AddTransactionButton({
  categories,
  defaultDate,
}: {
  categories: CategoryOption[];
  defaultDate?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        + Add transaction
      </button>
      <Modal
        open={open}
        title="Quick Add"
        onClose={() => setOpen(false)}
        size="lg"
        bare
      >
        <TransactionForm
          variant="quick"
          categories={categories}
          defaultDate={defaultDate}
          onSaved={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

export function EditDebtGoalButton({
  goal,
  label = "Edit goal",
}: {
  goal: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <Modal open={open} title="Debt payoff goal" onClose={() => setOpen(false)}>
        <ActionForm
          action={updateDebtGoal}
          successMessage="Debt payoff goal saved"
          errorMessage="Could not save goal"
          className="form-stack"
          onSuccess={() => setOpen(false)}
        >
          <div className="field">
            <label htmlFor="goalPayoffDate">Target zero-debt date</label>
            <input
              id="goalPayoffDate"
              name="goalPayoffDate"
              type="date"
              required
              defaultValue={goal}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              Save goal
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}
