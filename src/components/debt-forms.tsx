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
  computeFlatAnnualInterestPercent,
  computeMonthlyEmi,
  computeMonthlyEmiFromInterestPercent,
  computeMonthlyInterest,
  computePaidTillNow,
  computeTotalInterest,
  remainingMonths,
} from "@/lib/debt-account";
import {
  DEBT_TYPE_OPTIONS,
  DEBT_TYPE_PRESETS,
  defaultPaymentTypeForAccount,
  isBorrowedType,
  isKuriType,
  isLentType,
  isNoInterestType,
  isRevolvingCreditType,
  paymentOptionsForAccountType,
} from "@/lib/debt-kinds";

type DebtAccountFormValues = {
  id?: string;
  name: string;
  type: string;
  startingBalance: string;
  monthlyEmi: string;
  interestPercent: string;
  totalMonths: string;
  monthsPaid: string;
  paidTillNow: string;
  status: string;
  logAsIncome: boolean;
};

const emptyValues: DebtAccountFormValues = {
  name: "",
  type: "",
  startingBalance: "0",
  monthlyEmi: "0",
  interestPercent: "0",
  totalMonths: "0",
  monthsPaid: "0",
  paidTillNow: "0",
  status: "Active Paydown",
  logAsIncome: false,
};

function DebtAccountFields({
  values,
  onChange,
  mode,
}: {
  values: DebtAccountFormValues;
  onChange: (next: DebtAccountFormValues) => void;
  mode: "create" | "edit";
}) {
  const starting = Number(values.startingBalance) || 0;
  const emi = Number(values.monthlyEmi) || 0;
  const total = Math.max(0, Math.floor(Number(values.totalMonths) || 0));
  const paidMonths = Math.max(0, Math.floor(Number(values.monthsPaid) || 0));
  const paidTillNow = Number(values.paidTillNow) || 0;

  const principalEmi = computeMonthlyEmi(starting, total);
  const monthlyInterest = computeMonthlyInterest({
    startingBalance: starting,
    totalMonths: total,
    monthlyEmi: emi,
  });
  const totalInterest = computeTotalInterest({
    startingBalance: starting,
    totalMonths: total,
    monthlyEmi: emi,
  });
  // Paid toward principal uses principal installment, not interest-inclusive EMI.
  const computedPaid = computePaidTillNow(principalEmi, paidMonths);
  const monthsLeft = remainingMonths(total, paidMonths);
  const isBorrowed = isBorrowedType(values.type);
  const isLent = isLentType(values.type);
  const isKuri = isKuriType(values.type);
  const isRevolving = isRevolvingCreditType(values.type);
  const isNoInterest = isNoInterestType(values.type);
  const hideInterest = isNoInterest || isKuri || isRevolving;
  const showOpeningCashflow = mode === "create" && (isBorrowed || isLent);

  function setField<K extends keyof DebtAccountFormValues>(
    key: K,
    value: DebtAccountFormValues[K],
  ) {
    onChange({ ...values, [key]: value });
  }

  function setType(nextType: string) {
    const borrowed = isBorrowedType(nextType);
    const lent = isLentType(nextType);
    const noInterest =
      isNoInterestType(nextType) ||
      isKuriType(nextType) ||
      isRevolvingCreditType(nextType);
    const next: DebtAccountFormValues = {
      ...values,
      type: nextType,
      logAsIncome: mode === "create" ? borrowed || lent : values.logAsIncome,
      interestPercent: noInterest ? "0" : values.interestPercent,
      status: isKuriType(nextType)
        ? "Active Kuri"
        : isRevolvingCreditType(nextType)
          ? "Revolving"
          : values.status || "Active Paydown",
    };
    if (noInterest) {
      applyTenure(next);
      return;
    }
    onChange(next);
  }

  function applyTenure(next: DebtAccountFormValues) {
    const nextStarting = Number(next.startingBalance) || 0;
    const nextTotal = Math.max(0, Math.floor(Number(next.totalMonths) || 0));
    const nextPaidMonths = Math.max(
      0,
      Math.floor(Number(next.monthsPaid) || 0),
    );
    const nextPrincipal = computeMonthlyEmi(nextStarting, nextTotal);
    const forcePrincipalOnly =
      isNoInterestType(next.type) ||
      isKuriType(next.type) ||
      isRevolvingCreditType(next.type);
    const rate = forcePrincipalOnly
      ? 0
      : Math.max(0, Number(next.interestPercent) || 0);
    const nextEmi =
      rate > 0
        ? computeMonthlyEmiFromInterestPercent({
            startingBalance: nextStarting,
            totalMonths: nextTotal,
            interestPercent: rate,
          })
        : nextPrincipal;
    next.interestPercent = String(rate);
    next.monthlyEmi = String(nextEmi);
    next.paidTillNow = String(computePaidTillNow(nextPrincipal, nextPaidMonths));
    onChange(next);
  }

  function setStartingOrTenure(
    key: "startingBalance" | "totalMonths",
    value: string,
  ) {
    applyTenure({ ...values, [key]: value });
  }

  function setInterestPercent(value: string) {
    applyTenure({ ...values, interestPercent: value });
  }

  function setMonthlyEmi(value: string) {
    const next = { ...values, monthlyEmi: value };
    const nextEmi = Number(value) || 0;
    const nextStarting = Number(next.startingBalance) || 0;
    const nextTotal = Math.max(0, Math.floor(Number(next.totalMonths) || 0));
    const nextPaidMonths = Math.max(
      0,
      Math.floor(Number(next.monthsPaid) || 0),
    );
    const nextPrincipal = computeMonthlyEmi(nextStarting, nextTotal);
    next.interestPercent = String(
      computeFlatAnnualInterestPercent({
        startingBalance: nextStarting,
        totalMonths: nextTotal,
        monthlyEmi: nextEmi,
      }),
    );
    next.paidTillNow = String(computePaidTillNow(nextPrincipal, nextPaidMonths));
    onChange(next);
  }

  function setMonthsPaid(value: string) {
    const next = { ...values, monthsPaid: value };
    const nextPaidMonths = Math.max(0, Math.floor(Number(value) || 0));
    const nextStarting = Number(next.startingBalance) || 0;
    const nextTotal = Math.max(0, Math.floor(Number(next.totalMonths) || 0));
    const nextPrincipal = computeMonthlyEmi(nextStarting, nextTotal);
    next.paidTillNow = String(computePaidTillNow(nextPrincipal, nextPaidMonths));
    onChange(next);
  }

  return (
    <>
      <div className="field">
        <label htmlFor="debt-name">Name</label>
        <input
          id="debt-name"
          name="name"
          required
          placeholder="Name"
          autoComplete="off"
          autoFocus
          value={values.name}
          onChange={(e) => setField("name", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="debt-type">Type</label>
        <input type="hidden" name="type" value={values.type} />
        <select
          id="debt-type"
          required
          value={
            DEBT_TYPE_PRESETS.some((t) => t === values.type)
              ? values.type
              : values.type
                ? "__custom__"
                : ""
          }
          onChange={(e) => {
            const next = e.target.value;
            if (next === "__custom__") return;
            setType(next);
          }}
        >
          <option value="" disabled>
            Choose a type…
          </option>
          {DEBT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {values.type &&
          !DEBT_TYPE_PRESETS.some((t) => t === values.type) ? (
            <option value="__custom__">{values.type}</option>
          ) : null}
        </select>
      </div>
      {showOpeningCashflow ? (
        <div className="field">
          <label className="debt-check-label" htmlFor="debt-log-income">
            <input
              id="debt-log-income"
              name="logAsIncome"
              type="checkbox"
              value="true"
              checked={values.logAsIncome}
              onChange={(e) => setField("logAsIncome", e.target.checked)}
            />
            {isLent
              ? "Log as expense when created"
              : "Log as income when created"}
          </label>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="debt-starting">
          {isKuri ? "Pot amount" : isRevolving ? "Outstanding" : "Starting amount"}
        </label>
        <input
          id="debt-starting"
          name="startingBalance"
          type="number"
          step="0.01"
          min="0"
          required
          inputMode="decimal"
          placeholder="0"
          value={values.startingBalance}
          onChange={(e) => setStartingOrTenure("startingBalance", e.target.value)}
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
          placeholder="0"
          value={values.totalMonths}
          onChange={(e) => setStartingOrTenure("totalMonths", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="debt-emi">
          {isKuri ? "Monthly contribution" : "Monthly EMI / repayment"}
        </label>
        <div className="debt-paid-row">
          <input
            id="debt-emi"
            name="monthlyEmi"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0"
            value={values.monthlyEmi}
            onChange={(e) => setMonthlyEmi(e.target.value)}
          />
          {!hideInterest ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setMonthlyEmi(String(principalEmi))}
              disabled={principalEmi <= 0}
            >
              Principal only
            </button>
          ) : null}
        </div>
      </div>
      <input type="hidden" name="interestPercent" value={values.interestPercent} />
      {!hideInterest ? (
        <>
          <div className="field">
            <label htmlFor="debt-interest-pct">Interest % (flat annual)</label>
            <input
              id="debt-interest-pct"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0"
              value={values.interestPercent}
              onChange={(e) => setInterestPercent(e.target.value)}
            />
          </div>
          {total > 0 && starting > 0 ? (
            <div className="field">
              <div className="debt-live-stats debt-live-stats-inputs">
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="debt-monthly-interest">Monthly interest</label>
                  <input
                    id="debt-monthly-interest"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    value={String(monthlyInterest)}
                    onChange={(e) => {
                      const interest = Math.max(0, Number(e.target.value) || 0);
                      setMonthlyEmi(
                        String(
                          Math.round((principalEmi + interest) * 100) / 100,
                        ),
                      );
                    }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="debt-total-interest">Total interest</label>
                  <input
                    id="debt-total-interest"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    value={String(totalInterest)}
                    onChange={(e) => {
                      const interest = Math.max(0, Number(e.target.value) || 0);
                      if (total <= 0) return;
                      const nextEmi =
                        Math.round(((starting + interest) / total) * 100) / 100;
                      setMonthlyEmi(String(nextEmi));
                    }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="field">
        <label htmlFor="debt-months-paid">
          {isKuri ? "Contributions paid" : "EMIs paid"}
        </label>
        <input
          id="debt-months-paid"
          name="monthsPaid"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          placeholder="0"
          value={values.monthsPaid}
          onChange={(e) => setMonthsPaid(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="debt-months-left">Months left</label>
        <input
          id="debt-months-left"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          placeholder="0"
          value={String(monthsLeft)}
          onChange={(e) => {
            const left = Math.max(0, Math.floor(Number(e.target.value) || 0));
            if (total <= 0) return;
            const paid = Math.max(0, Math.min(total, total - left));
            setMonthsPaid(String(paid));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="debt-outstanding">
          {isKuri ? "Remaining" : "Remaining / outstanding"}
        </label>
        <input
          id="debt-outstanding"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="0"
          value={
            starting > 0
              ? String(
                  Math.round(Math.max(0, starting - paidTillNow) * 100) / 100,
                )
              : "0"
          }
          onChange={(e) => {
            const outstanding = Math.max(0, Number(e.target.value) || 0);
            const paid = Math.max(
              0,
              Math.round((starting - outstanding) * 100) / 100,
            );
            setField("paidTillNow", String(paid));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="debt-paid-till-now">
          {isKuri ? "Contributed so far" : "Principal paid so far"}
        </label>
        <div className="debt-paid-row">
          <input
            id="debt-paid-till-now"
            name="paidTillNow"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0"
            value={values.paidTillNow}
            onChange={(e) => setField("paidTillNow", e.target.value)}
          />
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setField("paidTillNow", String(computedPaid))}
          >
            From EMI count
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="debt-status">Status</label>
        <input
          id="debt-status"
          name="status"
          placeholder="Status"
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
          <DebtAccountFields values={values} onChange={setValues} mode="create" />
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
  interestPercent?: string | number;
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
  const initial = useMemo<DebtAccountFormValues>(() => {
    const starting = Number(account.startingBalance) || 0;
    const months = account.totalMonths ?? 0;
    const monthly = Number(account.monthlyEmi) || 0;
    const savedRate = Number(account.interestPercent);
    const computedRate = computeFlatAnnualInterestPercent({
      startingBalance: starting,
      totalMonths: months,
      monthlyEmi: monthly,
    });
    const interestPercent = String(
      Number.isFinite(savedRate) && savedRate > 0 ? savedRate : computedRate,
    );
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      startingBalance: String(account.startingBalance),
      monthlyEmi: String(account.monthlyEmi),
      interestPercent,
      totalMonths: String(months),
      monthsPaid: String(account.monthsPaid ?? 0),
      paidTillNow: String(account.paidTillNow ?? 0),
      status: account.status,
      logAsIncome: false,
    };
  }, [account]);
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
          <DebtAccountFields values={values} onChange={setValues} mode="edit" />
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

type AccountOption = { id: string; name: string; type: string };

export function AddDebtPaymentButton({
  accounts,
  defaultAccountId,
}: {
  accounts: AccountOption[];
  defaultAccountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const initialAccount =
    accounts.find((a) => a.id === defaultAccountId) ?? accounts[0];
  const [accountId, setAccountId] = useState(initialAccount?.id ?? "");
  const selected = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const paymentOptions = paymentOptionsForAccountType(selected?.type ?? "");
  const [paymentType, setPaymentType] = useState(
    defaultPaymentTypeForAccount(selected?.type ?? ""),
  );
  const disabled = accounts.length === 0;

  function close() {
    setOpen(false);
    const first =
      accounts.find((a) => a.id === defaultAccountId) ?? accounts[0];
    setAccountId(first?.id ?? "");
    setPaymentType(defaultPaymentTypeForAccount(first?.type ?? ""));
  }

  function openModal() {
    const first =
      accounts.find((a) => a.id === defaultAccountId) ?? accounts[0];
    setAccountId(first?.id ?? "");
    setPaymentType(defaultPaymentTypeForAccount(first?.type ?? ""));
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={openModal}
        disabled={disabled}
        title={disabled ? "Add a debt account first" : undefined}
      >
        + Log payment
      </button>
      <Modal open={open} title="Log payment" onClose={close}>
        <ActionForm
          action={createDebtPayment}
          successMessage="Payment logged"
          errorMessage="Could not add payment"
          className="form-stack"
          resetOnSuccess
          onSuccess={close}
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
              value={accountId}
              onChange={(e) => {
                const id = e.target.value;
                setAccountId(id);
                const acc = accounts.find((a) => a.id === id);
                setPaymentType(defaultPaymentTypeForAccount(acc?.type ?? ""));
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.type}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pay-type">Payment type</label>
            <select
              id="pay-type"
              name="paymentType"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            >
              {paymentOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
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
              placeholder="0"
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
            <button type="button" className="btn btn-ghost" onClick={close}>
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
