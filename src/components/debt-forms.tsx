"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { createDebtAccount, createDebtPayment } from "@/lib/actions";

export function AddDebtAccountButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        + Add debt
      </button>
      <Modal open={open} title="Add debt account" onClose={() => setOpen(false)}>
        <ActionForm
          action={createDebtAccount}
          successMessage="Debt account added"
          errorMessage="Could not add account"
          className="form-stack"
          resetOnSuccess
          onSuccess={() => setOpen(false)}
        >
          <div className="field">
            <label htmlFor="debt-name">Account / card</label>
            <input
              id="debt-name"
              name="name"
              required
              placeholder="AXIS MY Zone"
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="debt-type">Type</label>
            <input
              id="debt-type"
              name="type"
              required
              placeholder="Credit Card EMI"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="debt-starting">Starting balance</label>
            <input
              id="debt-starting"
              name="startingBalance"
              type="number"
              step="0.01"
              min="0"
              required
              inputMode="decimal"
              defaultValue="0"
            />
          </div>
          <div className="field">
            <label htmlFor="debt-status">Status</label>
            <input
              id="debt-status"
              name="status"
              defaultValue="Active Paydown"
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
              Save debt
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

type AccountOption = { id: string; name: string };

export function AddDebtPaymentButton({
  accounts,
}: {
  accounts: AccountOption[];
}) {
  const [open, setOpen] = useState(false);
  const disabled = accounts.length === 0;

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Add a debt account first" : undefined}
      >
        + Log payment
      </button>
      <Modal open={open} title="Log payment" onClose={() => setOpen(false)}>
        <ActionForm
          action={createDebtPayment}
          successMessage="Payment logged"
          errorMessage="Could not add payment"
          className="form-stack"
          resetOnSuccess
          onSuccess={() => setOpen(false)}
        >
          <div className="field">
            <label htmlFor="pay-dueDate">Due date</label>
            <input id="pay-dueDate" name="dueDate" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="pay-accountId">Account</label>
            <select
              id="pay-accountId"
              name="accountId"
              required
              defaultValue={accounts[0]?.id}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pay-type">Payment type</label>
            <input id="pay-type" name="paymentType" defaultValue="EMI" />
          </div>
          <div className="field">
            <label htmlFor="pay-amount">Amount</label>
            <input
              id="pay-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              inputMode="decimal"
            />
          </div>
          <div className="field">
            <label htmlFor="pay-isPaid">Paid?</label>
            <select id="pay-isPaid" name="isPaid" defaultValue="true">
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
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
              Save payment
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}
