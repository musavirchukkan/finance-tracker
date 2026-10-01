"use client";

import { useMemo, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import {
  createDebtAccount,
  createDebtPayment,
  updateDebtAccount,
} from "@/lib/actions";
import {
  computePaidTillNow,
  remainingBalance,
  remainingMonths,
} from "@/lib/debt-account";
import { formatINR } from "@/lib/money";

type DebtAccountFormValues = {
  id?: string;
  name: string;
  type: string;
  startingBalance: string;
  monthlyEmi: string;
  totalMonths: string;
  monthsPaid: string;
  paidTillNow: string;
  status: string;
};

const emptyValues: DebtAccountFormValues = {
  name: "",
  type: "",
  startingBalance: "0",
  monthlyEmi: "0",
  totalMonths: "0",
  monthsPaid: "0",
  paidTillNow: "0",
  status: "Active Paydown",
};

function DebtAccountFields({
  values,
  onChange,
}: {
  values: DebtAccountFormValues;
  onChange: (next: DebtAccountFormValues) => void;
}) {
  const starting = Number(values.startingBalance) || 0;
  const emi = Number(values.monthlyEmi) || 0;
  const total = Math.max(0, Math.floor(Number(values.totalMonths) || 0));
  const paidMonths = Math.max(0, Math.floor(Number(values.monthsPaid) || 0));
  const paidTillNow = Number(values.paidTillNow) || 0;

  const computedPaid = computePaidTillNow(emi, paidMonths);
  const monthsLeft = remainingMonths(total, paidMonths);
  const balanceLeft = remainingBalance(starting, paidTillNow);

  function setField<K extends keyof DebtAccountFormValues>(
    key: K,
    value: DebtAccountFormValues[K],
  ) {
    onChange({ ...values, [key]: value });
  }

  function setEmiOrMonths(
    key: "monthlyEmi" | "monthsPaid",
    value: string,
  ) {
    const next = { ...values, [key]: value };
    const nextEmi =
      key === "monthlyEmi" ? Number(value) || 0 : Number(next.monthlyEmi) || 0;
    const nextPaidMonths =
      key === "monthsPaid"
        ? Math.max(0, Math.floor(Number(value) || 0))
        : Math.max(0, Math.floor(Number(next.monthsPaid) || 0));
    next.paidTillNow = String(computePaidTillNow(nextEmi, nextPaidMonths));
    onChange(next);
  }

  return (
    <>
      <div className="field">
        <label htmlFor="debt-name">Account / card</label>
        <input
          id="debt-name"
          name="name"
          required
          placeholder="AXIS MY Zone"
          autoComplete="off"
          autoFocus
          value={values.name}
          onChange={(e) => setField("name", e.target.value)}
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
          value={values.type}
          onChange={(e) => setField("type", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="debt-starting">Starting amount</label>
        <input
          id="debt-starting"
          name="startingBalance"
          type="number"
          step="0.01"
          min="0"
          required
          inputMode="decimal"
          value={values.startingBalance}
          onChange={(e) => setField("startingBalance", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="debt-emi">Monthly EMI</label>
        <input
          id="debt-emi"
          name="monthlyEmi"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={values.monthlyEmi}
          onChange={(e) => setEmiOrMonths("monthlyEmi", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="debt-total-months">Total months</label>
        <input
          id="debt-total-months"
          name="totalMonths"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={values.totalMonths}
          onChange={(e) => setField("totalMonths", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="debt-months-paid">Months paid already</label>
        <input
          id="debt-months-paid"
          name="monthsPaid"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={values.monthsPaid}
          onChange={(e) => setEmiOrMonths("monthsPaid", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="debt-paid-till-now">Paid till now</label>
        <div className="debt-paid-row">
          <input
            id="debt-paid-till-now"
            name="paidTillNow"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={values.paidTillNow}
            onChange={(e) => setField("paidTillNow", e.target.value)}
          />
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setField("paidTillNow", String(computedPaid))}
          >
            Recalculate
          </button>
        </div>
        <p className="muted page-sub" style={{ margin: "0.35rem 0 0" }}>
          Suggested {formatINR(computedPaid)} from EMI × months paid.
        </p>
      </div>
      <div className="debt-live-stats" aria-live="polite">
        <div>
          <span className="muted">Months left</span>
          <strong>{monthsLeft}</strong>
        </div>
        <div>
          <span className="muted">Remaining</span>
          <strong>{formatINR(balanceLeft)}</strong>
        </div>
      </div>
      <div className="field">
        <label htmlFor="debt-status">Status</label>
        <input
          id="debt-status"
          name="status"
          value={values.status}
          onChange={(e) => setField("status", e.target.value)}
        />
      </div>
    </>
  );
}

export function AddDebtAccountButton() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<DebtAccountFormValues>(emptyValues);

  function close() {
    setOpen(false);
    setValues(emptyValues);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        + Add debt
      </button>
      <Modal open={open} title="Add debt account" onClose={close} size="md">
        <ActionForm
          action={createDebtAccount}
          successMessage="Debt account added"
          errorMessage="Could not add account"
          className="form-stack"
          onSuccess={close}
        >
          <DebtAccountFields values={values} onChange={setValues} />
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>
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

export type EditableDebtAccount = {
  id: string;
  name: string;
  type: string;
  startingBalance: string | number;
  monthlyEmi: string | number;
  totalMonths: number;
  monthsPaid: number;
  paidTillNow: number;
  status: string;
};

export function EditDebtAccountButton({
  account,
}: {
  account: EditableDebtAccount;
}) {
  const [open, setOpen] = useState(false);
  const initial = useMemo<DebtAccountFormValues>(
    () => ({
      id: account.id,
      name: account.name,
      type: account.type,
      startingBalance: String(account.startingBalance),
      monthlyEmi: String(account.monthlyEmi),
      totalMonths: String(account.totalMonths ?? 0),
      monthsPaid: String(account.monthsPaid ?? 0),
      paidTillNow: String(account.paidTillNow ?? 0),
      status: account.status,
    }),
    [account],
  );
  const [values, setValues] = useState<DebtAccountFormValues>(initial);

  function openModal() {
    setValues(initial);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={openModal}
      >
        Edit
      </button>
      <Modal
        open={open}
        title="Edit debt account"
        onClose={() => setOpen(false)}
        size="md"
      >
        <ActionForm
          action={updateDebtAccount}
          successMessage="Debt account updated"
          errorMessage="Could not update account"
          className="form-stack"
          onSuccess={() => setOpen(false)}
        >
          <input type="hidden" name="id" value={account.id} />
          <DebtAccountFields values={values} onChange={setValues} />
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              Save changes
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
