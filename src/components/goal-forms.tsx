"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import {
  contributeToSavingsGoal,
  createSavingsGoal,
  deleteSavingsGoal,
} from "@/lib/actions";
import { formatINR } from "@/lib/money";

export function AddGoalButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        + Add goal
      </button>
      <Modal open={open} title="Create savings goal" onClose={() => setOpen(false)}>
        <ActionForm
          action={createSavingsGoal}
          successMessage="Goal created"
          errorMessage="Could not create goal"
          className="form-stack"
          resetOnSuccess
          onSuccess={() => setOpen(false)}
        >
          <div className="field">
            <label htmlFor="goal-name">Goal name</label>
            <input
              id="goal-name"
              name="name"
              required
              placeholder="Emergency fund"
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="goal-target">Target amount</label>
            <input
              id="goal-target"
              name="targetAmount"
              type="number"
              step="0.01"
              min="0.01"
              required
              inputMode="decimal"
              placeholder="100000"
            />
          </div>
          <div className="field">
            <label htmlFor="goal-current">Already saved (optional)</label>
            <input
              id="goal-current"
              name="currentAmount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue="0"
            />
          </div>
          <div className="field">
            <label htmlFor="goal-date">Target date (optional)</label>
            <input id="goal-date" name="targetDate" type="date" />
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
              Create goal
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function AddMoneyToGoalButton({
  goalId,
  goalName,
  remaining,
}: {
  goalId: string;
  goalName: string;
  remaining: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        + Add money
      </button>
      <Modal
        open={open}
        title={`Add to ${goalName}`}
        onClose={() => setOpen(false)}
      >
        <ActionForm
          action={contributeToSavingsGoal}
          successMessage="Contribution saved"
          errorMessage="Could not add money"
          className="form-stack"
          resetOnSuccess
          onSuccess={() => setOpen(false)}
        >
          <input type="hidden" name="id" value={goalId} />
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            {remaining > 0
              ? `${formatINR(remaining)} left to reach this goal.`
              : "Target reached — you can still add more."}
          </p>
          <div className="field">
            <label htmlFor={`goal-add-${goalId}`}>Amount</label>
            <input
              id={`goal-add-${goalId}`}
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              inputMode="decimal"
              placeholder="5000"
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
              Add money
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function DeleteGoalButton({
  goalId,
  goalName,
}: {
  goalId: string;
  goalName: string;
}) {
  return (
    <ActionForm
      action={deleteSavingsGoal}
      successMessage="Goal deleted"
      errorMessage="Could not delete goal"
      confirmMessage={`Delete “${goalName}”? This cannot be undone.`}
    >
      <input type="hidden" name="id" value={goalId} />
      <button className="btn btn-ghost btn-xs" type="submit">
        Delete
      </button>
    </ActionForm>
  );
}
