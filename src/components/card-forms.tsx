"use client";

import { useMemo, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import {
  createCreditCard,
  deleteCardActivity,
  logCardBillPayment,
  logCardFee,
  logWalletCashout,
  logWalletRecharge,
  updateCreditCard,
} from "@/lib/card-actions";

function todayLocal() {
  return new Date().toISOString().slice(0, 10);
}

type CardFormValues = {
  id?: string;
  name: string;
  currentOutstanding: string;
  creditLimit: string;
  billingDay: string;
  paymentDueDay: string;
  status: string;
};

const emptyCard: CardFormValues = {
  name: "",
  currentOutstanding: "0",
  creditLimit: "",
  billingDay: "",
  paymentDueDay: "",
  status: "Active",
};

function CardFields({
  values,
  onChange,
}: {
  values: CardFormValues;
  onChange: (next: CardFormValues) => void;
}) {
  function set<K extends keyof CardFormValues>(key: K, value: CardFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <>
      <div className="field">
        <label htmlFor="card-name">Name</label>
        <input
          id="card-name"
          name="name"
          required
          placeholder="Name"
          autoFocus
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="card-outstanding">Outstanding</label>
        <input
          id="card-outstanding"
          name="currentOutstanding"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="0"
          value={values.currentOutstanding}
          onChange={(e) => set("currentOutstanding", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="card-limit">Credit limit</label>
        <input
          id="card-limit"
          name="creditLimit"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="0"
          value={values.creditLimit}
          onChange={(e) => set("creditLimit", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="card-billing">Billing day (1–31)</label>
        <input
          id="card-billing"
          name="billingDay"
          type="number"
          min="1"
          max="31"
          inputMode="numeric"
          placeholder="1"
          value={values.billingDay}
          onChange={(e) => set("billingDay", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="card-due">Payment due day (1–31)</label>
        <input
          id="card-due"
          name="paymentDueDay"
          type="number"
          min="1"
          max="31"
          inputMode="numeric"
          placeholder="15"
          value={values.paymentDueDay}
          onChange={(e) => set("paymentDueDay", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="card-status">Status</label>
        <input
          id="card-status"
          name="status"
          placeholder="Status"
          value={values.status}
          onChange={(e) => set("status", e.target.value)}
        />
      </div>
    </>
  );
}

export function AddCreditCardButton() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<CardFormValues>(emptyCard);

  function close() {
    setOpen(false);
    setValues(emptyCard);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        + Add card
      </button>
      <Modal open={open} title="Add credit card" onClose={close} size="md">
        <ActionForm
          action={createCreditCard}
          successMessage="Card added"
          errorMessage="Could not add card"
          className="form-stack"
          onSuccess={close}
        >
          <CardFields values={values} onChange={setValues} />
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              Save card
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function EditCreditCardButton({
  card,
}: {
  card: {
    id: string;
    name: string;
    currentOutstanding: string | number;
    creditLimit?: string | number | null;
    billingDay?: number | null;
    paymentDueDay?: number | null;
    status: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const initial = useMemo<CardFormValues>(
    () => ({
      id: card.id,
      name: card.name,
      currentOutstanding: String(card.currentOutstanding ?? "0"),
      creditLimit:
        card.creditLimit != null && card.creditLimit !== ""
          ? String(card.creditLimit)
          : "",
      billingDay: card.billingDay != null ? String(card.billingDay) : "",
      paymentDueDay:
        card.paymentDueDay != null ? String(card.paymentDueDay) : "",
      status: card.status,
    }),
    [card],
  );
  const [values, setValues] = useState(initial);

  function openModal() {
    setValues(initial);
    setOpen(true);
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-xs" onClick={openModal}>
        Edit
      </button>
      <Modal
        open={open}
        title="Edit credit card"
        onClose={() => setOpen(false)}
        size="md"
      >
        <ActionForm
          action={updateCreditCard}
          successMessage="Card updated"
          errorMessage="Could not update card"
          className="form-stack"
          onSuccess={() => setOpen(false)}
        >
          <input type="hidden" name="id" value={card.id} />
          <CardFields values={values} onChange={setValues} />
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

function DateAmountShell({
  open,
  title,
  onClose,
  action,
  successMessage,
  cardId,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  action: (fd: FormData) => Promise<void>;
  successMessage: string;
  cardId: string;
  children: React.ReactNode;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <ActionForm
        action={action}
        successMessage={successMessage}
        errorMessage="Could not save"
        className="form-stack"
        resetOnSuccess
        onSuccess={onClose}
      >
        <input type="hidden" name="cardId" value={cardId} />
        <div className="field">
          <label htmlFor="card-act-date">Date</label>
          <input
            id="card-act-date"
            name="date"
            type="date"
            required
            defaultValue={todayLocal()}
          />
        </div>
        {children}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit">
            Save
          </button>
        </div>
      </ActionForm>
    </Modal>
  );
}

export function WalletRechargeButton({ cardId }: { cardId: string }) {
  const [open, setOpen] = useState(false);
  const [walletCredit, setWalletCredit] = useState("");
  const [cardCharged, setCardCharged] = useState("");
  const credit = Number(walletCredit) || 0;
  const charged = Number(cardCharged) || 0;
  const fee = Math.max(0, Math.round((charged - credit) * 100) / 100);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        Wallet recharge
      </button>
      <DateAmountShell
        open={open}
        title="Wallet recharge"
        onClose={() => {
          setOpen(false);
          setWalletCredit("");
          setCardCharged("");
        }}
        action={logWalletRecharge}
        successMessage="Recharge logged"
        cardId={cardId}
      >
        <div className="field">
          <label htmlFor="wallet-credit">Wallet credit</label>
          <input
            id="wallet-credit"
            name="walletCredit"
            type="number"
            step="0.01"
            min="0"
            required
            inputMode="decimal"
            placeholder="0"
            value={walletCredit}
            onChange={(e) => {
              setWalletCredit(e.target.value);
              if (!cardCharged) setCardCharged(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="card-charged">Card charged</label>
          <input
            id="card-charged"
            name="cardCharged"
            type="number"
            step="0.01"
            min="0"
            required
            inputMode="decimal"
            placeholder="0"
            value={cardCharged}
            onChange={(e) => setCardCharged(e.target.value)}
          />
        </div>
        <p className="muted page-sub" style={{ margin: 0 }}>
          Fee (charged − credit): {fee.toFixed(2)}
        </p>
        <div className="field">
          <label htmlFor="recharge-note">Note</label>
          <input id="recharge-note" name="description" placeholder="Note" />
        </div>
      </DateAmountShell>
    </>
  );
}

export function WalletCashoutButton({
  cardId,
  bankAccounts = [],
}: {
  cardId: string;
  bankAccounts?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(true)}
      >
        Wallet → bank
      </button>
      <DateAmountShell
        open={open}
        title="Wallet → bank"
        onClose={() => setOpen(false)}
        action={logWalletCashout}
        successMessage="Cashout logged"
        cardId={cardId}
      >
        <div className="field">
          <label htmlFor="cashout-amount">Amount to bank</label>
          <input
            id="cashout-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            inputMode="decimal"
            placeholder="0"
          />
        </div>
        <div className="field">
          <label htmlFor="cashout-fee">Bank charge</label>
          <input
            id="cashout-fee"
            name="bankFee"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0"
            defaultValue="0"
          />
        </div>
        {bankAccounts.length > 0 ? (
          <div className="field">
            <label htmlFor="cashout-bank">Credit to account</label>
            <select id="cashout-bank" name="bankAccountId" defaultValue="">
              <option value="">Don’t update balance</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="cashout-note">Note</label>
          <input id="cashout-note" name="description" placeholder="Note" />
        </div>
      </DateAmountShell>
    </>
  );
}

export function CardFeeButton({ cardId }: { cardId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(true)}
      >
        Fee / charge
      </button>
      <DateAmountShell
        open={open}
        title="Card fee / charge"
        onClose={() => setOpen(false)}
        action={logCardFee}
        successMessage="Fee logged"
        cardId={cardId}
      >
        <div className="field">
          <label htmlFor="fee-amount">Amount</label>
          <input
            id="fee-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            inputMode="decimal"
            placeholder="0"
          />
        </div>
        <div className="field">
          <label className="debt-check-label" htmlFor="fee-log-expense">
            <input
              id="fee-log-expense"
              name="logExpense"
              type="checkbox"
              value="true"
              defaultChecked
            />
            Also log as expense
          </label>
        </div>
        <div className="field">
          <label htmlFor="fee-note">Note</label>
          <input id="fee-note" name="description" placeholder="Note" />
        </div>
      </DateAmountShell>
    </>
  );
}

export function PayBillButton({
  cardId,
  bankAccounts = [],
}: {
  cardId: string;
  bankAccounts?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        Pay bill
      </button>
      <DateAmountShell
        open={open}
        title="Pay bill"
        onClose={() => setOpen(false)}
        action={logCardBillPayment}
        successMessage="Bill payment logged"
        cardId={cardId}
      >
        <div className="field">
          <label htmlFor="bill-amount">Amount</label>
          <input
            id="bill-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            inputMode="decimal"
            placeholder="0"
          />
        </div>
        {bankAccounts.length > 0 ? (
          <div className="field">
            <label htmlFor="bill-bank">Pay from account</label>
            <select id="bill-bank" name="bankAccountId" defaultValue="">
              <option value="">Don’t update balance</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="bill-note">Note</label>
          <input id="bill-note" name="description" placeholder="Note" />
        </div>
      </DateAmountShell>
    </>
  );
}

export function DeleteCardActivityButton({
  activityId,
}: {
  activityId: string;
}) {
  return (
    <ActionForm
      action={deleteCardActivity}
      successMessage="Activity deleted"
      errorMessage="Could not delete"
      confirmMessage="Delete this activity?"
    >
      <input type="hidden" name="id" value={activityId} />
      <button className="btn btn-danger btn-xs" type="submit">
        Del
      </button>
    </ActionForm>
  );
}
