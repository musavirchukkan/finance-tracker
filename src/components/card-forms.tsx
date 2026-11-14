"use client";

import { useMemo, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import {
  createCreditCard,
  updateCreditCard,
} from "@/lib/card-crud-actions";
import {
  deleteCardActivity,
  logCardBillPayment,
  logCardFee,
  logWalletRecharge,
} from "@/lib/card-activity-actions";
import { formatINR } from "@/lib/money";
import { todayLocal } from "@/lib/utc-time";

type ShareLimitOption = {
  id: string;
  label: string;
  /** Parent card's own credit limit (shown disabled when sharing). */
  creditLimit?: number | null;
};

type CardFormValues = {
  id?: string;
  name: string;
  currentOutstanding: string;
  statementAmount: string;
  pinToCurrentStatement: boolean;
  creditLimit: string;
  sharesLimitWithId: string;
  billingDay: string;
  paymentDueGapDays: string;
  lastFour: string;
  isRupay: boolean;
  status: string;
  showInPaymentPicker: boolean;
};

const emptyCard: CardFormValues = {
  name: "",
  currentOutstanding: "0",
  statementAmount: "",
  pinToCurrentStatement: true,
  creditLimit: "",
  sharesLimitWithId: "",
  billingDay: "",
  paymentDueGapDays: "20",
  lastFour: "",
  isRupay: false,
  status: "Active",
  showInPaymentPicker: true,
};

function CardFields({
  values,
  onChange,
  shareOptions = [],
}: {
  values: CardFormValues;
  onChange: (next: CardFormValues) => void;
  shareOptions?: ShareLimitOption[];
}) {
  function set<K extends keyof CardFormValues>(key: K, value: CardFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  const sharesLimit = !!values.sharesLimitWithId;
  const sharedParent = sharesLimit
    ? shareOptions.find((o) => o.id === values.sharesLimitWithId)
    : undefined;
  const sharedLimitDisplay =
    sharedParent?.creditLimit != null && Number.isFinite(sharedParent.creditLimit)
      ? String(sharedParent.creditLimit)
      : "";

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
        <label htmlFor="card-last-four">Last 4 digits</label>
        <input
          id="card-last-four"
          name="lastFour"
          inputMode="numeric"
          maxLength={4}
          placeholder="1234"
          value={values.lastFour}
          onChange={(e) =>
            set("lastFour", e.target.value.replace(/\D/g, "").slice(0, 4))
          }
        />
      </div>
      <div className="field">
        <label className="debt-check-label" htmlFor="card-rupay">
          <input
            id="card-rupay"
            name="isRupay"
            type="checkbox"
            value="true"
            checked={values.isRupay}
            onChange={(e) => set("isRupay", e.target.checked)}
          />
          RuPay (can pay via UPI)
        </label>
      </div>
      <div className="field">
        <label htmlFor="card-outstanding">Outstanding (revolving)</label>
        <input
          id="card-outstanding"
          name="currentOutstanding"
          type="number"
          step="0.01"
          inputMode="decimal"
          placeholder="0"
          value={values.currentOutstanding}
          onChange={(e) => set("currentOutstanding", e.target.value)}
        />
        <p className="muted page-sub" style={{ margin: "0.35rem 0 0" }}>
          Negative = prepaid / cashback / overpay on this card only. Later spends
          on this card use that credit first. Shared-limit siblings do not get it.
        </p>
      </div>
      <div className="field">
        <label htmlFor="card-statement">Statement / bill amount</label>
        <input
          id="card-statement"
          name="statementAmount"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="Same as outstanding if blank"
          value={values.statementAmount}
          onChange={(e) => set("statementAmount", e.target.value)}
        />
        <p className="muted page-sub" style={{ margin: "0.35rem 0 0" }}>
          Closed bill due this cycle. Anything above this in outstanding is
          treated as next bill (open).
        </p>
      </div>
      <div className="field">
        <label className="debt-check-label" htmlFor="card-pin-statement">
          <input
            id="card-pin-statement"
            name="pinToCurrentStatement"
            type="checkbox"
            value="true"
            checked={values.pinToCurrentStatement}
            onChange={(e) => set("pinToCurrentStatement", e.target.checked)}
          />
          Include on this month&apos;s bill (due this cycle)
        </label>
        <p className="muted page-sub" style={{ margin: "0.35rem 0 0" }}>
          Use when the statement already closed (e.g. bill day 13, today 17)
          but payment is still due next month — keeps outstanding on due-to-pay.
        </p>
      </div>
      {shareOptions.length > 0 ? (
        <div className="field">
          <label htmlFor="card-share-limit">Shares limit with</label>
          <select
            id="card-share-limit"
            name="sharesLimitWithId"
            value={values.sharesLimitWithId}
            onChange={(e) => {
              const next = e.target.value;
              onChange({
                ...values,
                sharesLimitWithId: next,
                // Own limit is unused while sharing — keep form state clear so
                // a disabled display value is never submitted as this card's limit.
                creditLimit: next ? "" : values.creditLimit,
              });
            }}
          >
            <option value="">None — owns its own limit</option>
            {shareOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.creditLimit != null && Number.isFinite(o.creditLimit)
                  ? ` · ${formatINR(o.creditLimit)}`
                  : ""}
              </option>
            ))}
          </select>
          <p className="muted page-sub" style={{ margin: "0.35rem 0 0" }}>
            Use for Axis-style add-on cards that share one limit. EMI or spends
            on any linked card reduce available on all of them.
          </p>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="card-limit">
          {sharesLimit
            ? sharedParent
              ? `Credit limit (from ${sharedParent.label})`
              : "Credit limit (from shared card)"
            : "Credit limit"}
        </label>
        {sharesLimit ? (
          <>
            {/* Disabled inputs are not submitted — correct: shared cards store null limit. */}
            <input
              id="card-limit"
              type="text"
              inputMode="decimal"
              readOnly
              disabled
              value={
                sharedLimitDisplay
                  ? formatINR(Number(sharedLimitDisplay))
                  : "No limit set on shared card"
              }
              aria-describedby="card-limit-shared-hint"
            />
            <input type="hidden" name="creditLimit" value="" />
            <p
              id="card-limit-shared-hint"
              className="muted page-sub"
              style={{ margin: "0.35rem 0 0" }}
            >
              This card has no limit of its own — it uses the selected card&apos;s
              limit.
            </p>
          </>
        ) : (
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
        )}
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
        <label htmlFor="card-due-gap">Due after (days from bill)</label>
        <input
          id="card-due-gap"
          name="paymentDueGapDays"
          type="number"
          min="1"
          max="60"
          inputMode="numeric"
          placeholder="20"
          value={values.paymentDueGapDays}
          onChange={(e) => set("paymentDueGapDays", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="card-status">Status</label>
        <select
          id="card-status"
          name="status"
          value={values.status === "Inactive" ? "Inactive" : "Active"}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <p className="muted page-sub" style={{ margin: "0.35rem 0 0" }}>
          Inactive cards stay on Cards for history but are hidden from new
          transaction payment pickers.
        </p>
      </div>
      <div className="field">
        <label className="debt-check-label" htmlFor="card-show-picker">
          <input
            id="card-show-picker"
            name="showInPaymentPicker"
            type="checkbox"
            value="true"
            checked={values.showInPaymentPicker}
            onChange={(e) => set("showInPaymentPicker", e.target.checked)}
          />
          Show in transaction payment lists
        </label>
        <p className="muted page-sub" style={{ margin: "0.35rem 0 0" }}>
          Uncheck to hide an active card from Add / UPI / swipe dropdowns
          without marking it Inactive.
        </p>
      </div>
    </>
  );
}

export function AddCreditCardButton({
  shareOptions = [],
}: {
  shareOptions?: ShareLimitOption[];
}) {
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
          <CardFields
            values={values}
            onChange={setValues}
            shareOptions={shareOptions}
          />
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

function IconEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPay() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="6"
        width="18"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M3 10h18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EditCreditCardButton({
  card,
  shareOptions = [],
  iconOnly = false,
}: {
  card: {
    id: string;
    name: string;
    currentOutstanding: string | number;
    statementAmount?: string | number | null;
    pinToCurrentStatement?: boolean | null;
    creditLimit?: string | number | null;
    ownCreditLimitNum?: number | null;
    sharesLimitWithId?: string | null;
    billingDay?: number | null;
    paymentDueGapDays?: number | null;
    lastFour?: string | null;
    isRupay?: boolean;
    status: string;
    showInPaymentPicker?: boolean | null;
  };
  shareOptions?: ShareLimitOption[];
  /** Compact table action — icon with accessible label. */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const options = shareOptions.filter((o) => o.id !== card.id);
  const initial = useMemo<CardFormValues>(
    () => ({
      id: card.id,
      name: card.name,
      currentOutstanding: String(card.currentOutstanding ?? "0"),
      statementAmount:
        card.statementAmount != null && card.statementAmount !== ""
          ? String(card.statementAmount)
          : "",
      pinToCurrentStatement: card.pinToCurrentStatement !== false,
      creditLimit:
        card.sharesLimitWithId
          ? ""
          : card.ownCreditLimitNum != null
            ? String(card.ownCreditLimitNum)
            : card.creditLimit != null && card.creditLimit !== ""
              ? String(card.creditLimit)
              : "",
      sharesLimitWithId: card.sharesLimitWithId ?? "",
      billingDay: card.billingDay != null ? String(card.billingDay) : "",
      paymentDueGapDays:
        card.paymentDueGapDays != null ? String(card.paymentDueGapDays) : "20",
      lastFour: card.lastFour ?? "",
      isRupay: !!card.isRupay,
      status: card.status === "Inactive" ? "Inactive" : "Active",
      showInPaymentPicker: card.showInPaymentPicker !== false,
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
      <button
        type="button"
        className={
          iconOnly ? "row-icon-btn has-tip" : "btn btn-ghost btn-xs"
        }
        onClick={openModal}
        aria-label={iconOnly ? `Edit ${card.name}` : undefined}
        data-tip={iconOnly ? "Edit" : undefined}
      >
        {iconOnly ? <IconEdit /> : "Edit"}
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
          <CardFields
            values={values}
            onChange={setValues}
            shareOptions={options}
          />
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
        Card → wallet
      </button>
      <DateAmountShell
        open={open}
        title="Card → wallet"
        onClose={() => {
          setOpen(false);
          setWalletCredit("");
          setCardCharged("");
        }}
        action={logWalletRecharge}
        successMessage="Recharge logged — also added to transactions"
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
  dueAmount = 0,
  outstandingAmount = 0,
  buttonLabel = "Pay",
  iconOnly = false,
}: {
  cardId: string;
  bankAccounts?: { id: string; name: string }[];
  /** Statement / due-to-pay amount for a one-tap full due payment. */
  dueAmount?: number;
  /** Revolving outstanding for a one-tap full balance payment. */
  outstandingAmount?: number;
  buttonLabel?: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const due = Math.max(0, Math.round(dueAmount * 100) / 100);
  const outstanding = Math.round(outstandingAmount * 100) / 100;
  const defaultAmount =
    due > 0
      ? String(due)
      : outstanding > 0
        ? String(outstanding)
        : "";
  const [amount, setAmount] = useState(defaultAmount);

  function openModal() {
    setAmount(
      due > 0
        ? String(due)
        : outstanding > 0
          ? String(outstanding)
          : "",
    );
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={
          iconOnly
            ? "row-icon-btn row-icon-btn-primary has-tip"
            : "btn btn-primary btn-xs"
        }
        onClick={openModal}
        aria-label={iconOnly ? buttonLabel : undefined}
        data-tip={iconOnly ? buttonLabel : undefined}
      >
        {iconOnly ? <IconPay /> : buttonLabel}
      </button>
      <DateAmountShell
        open={open}
        title="Pay card bill"
        onClose={closeModal}
        action={logCardBillPayment}
        successMessage="Payment logged — transaction added and outstanding updated"
        cardId={cardId}
      >
        <div className="field">
          <div className="pay-presets" role="group" aria-label="Payment size">
            {due > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setAmount(String(due))}
              >
                Full due · {formatINR(due)}
              </button>
            ) : null}
            {outstanding > 0 && outstanding !== due ? (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setAmount(String(outstanding))}
              >
                Full outstanding · {formatINR(outstanding)}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setAmount("")}
            >
              Partial
            </button>
          </div>
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="muted" style={{ fontSize: "0.8rem", margin: "0.35rem 0 0" }}>
            Creates an expense on the date you pick and reduces this card&apos;s
            outstanding.
          </p>
        </div>
        <div className="field">
          <label htmlFor="bill-bank">Pay from account</label>
          <select id="bill-bank" name="bankAccountId" required defaultValue="">
            <option value="" disabled>
              {bankAccounts.length === 0
                ? "Add a bank account first…"
                : "Choose account…"}
            </option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
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
