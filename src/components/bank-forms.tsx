"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import {
  createBankAccount,
  deleteBankAccount,
  updateBankAccount,
} from "@/lib/bank-actions";

type BankFormValues = {
  id?: string;
  name: string;
  currentBalance: string;
  accountType: string;
  status: string;
};

const emptyBank: BankFormValues = {
  name: "",
  currentBalance: "0",
  accountType: "Savings",
  status: "Active",
};

function BankFields({
  values,
  onChange,
}: {
  values: BankFormValues;
  onChange: (next: BankFormValues) => void;
}) {
  function set<K extends keyof BankFormValues>(key: K, value: BankFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <>
      <div className="field">
        <label htmlFor="bank-name">Name</label>
        <input
          id="bank-name"
          name="name"
          required
          placeholder="e.g. HDFC Savings"
          autoFocus
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="bank-balance">Current balance</label>
        <input
          id="bank-balance"
          name="currentBalance"
          type="number"
          step="0.01"
          inputMode="decimal"
          placeholder="0"
          value={values.currentBalance}
          onChange={(e) => set("currentBalance", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="bank-type">Account type</label>
        <input
          id="bank-type"
          name="accountType"
          placeholder="Savings"
          value={values.accountType}
          onChange={(e) => set("accountType", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="bank-status">Status</label>
        <input
          id="bank-status"
          name="status"
          placeholder="Active"
          value={values.status}
          onChange={(e) => set("status", e.target.value)}
        />
      </div>
    </>
  );
}

export function AddBankAccountButton() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<BankFormValues>(emptyBank);

  function close() {
    setOpen(false);
    setValues(emptyBank);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        + Add account
      </button>
      <Modal open={open} title="Add bank account" onClose={close}>
        <ActionForm
          action={createBankAccount}
          successMessage="Account added"
          errorMessage="Could not add account"
          className="form-stack"
          onSuccess={close}
        >
          <BankFields values={values} onChange={setValues} />
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function EditBankAccountButton({
  account,
}: {
  account: {
    id: string;
    name: string;
    currentBalance: string;
    accountType: string;
    status: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<BankFormValues>({
    id: account.id,
    name: account.name,
    currentBalance: account.currentBalance,
    accountType: account.accountType,
    status: account.status,
  });

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => {
          setValues({
            id: account.id,
            name: account.name,
            currentBalance: account.currentBalance,
            accountType: account.accountType,
            status: account.status,
          });
          setOpen(true);
        }}
      >
        Edit
      </button>
      <Modal open={open} title="Edit bank account" onClose={close}>
        <ActionForm
          action={updateBankAccount}
          successMessage="Account updated"
          errorMessage="Could not update"
          className="form-stack"
          onSuccess={close}
        >
          <input type="hidden" name="id" value={account.id} />
          <BankFields values={values} onChange={setValues} />
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function DeleteBankAccountButton({
  accountId,
  name,
}: {
  accountId: string;
  name: string;
}) {
  return (
    <ActionForm
      action={deleteBankAccount}
      successMessage="Account deleted"
      errorMessage="Could not delete"
      confirmMessage={`Delete “${name}”? Linked transactions keep their history but lose the account link.`}
    >
      <input type="hidden" name="id" value={accountId} />
      <button className="btn btn-danger btn-xs" type="submit">
        Del
      </button>
    </ActionForm>
  );
}
