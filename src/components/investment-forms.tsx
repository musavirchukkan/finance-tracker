"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import {
  createInvestment,
  deleteInvestment,
  updateInvestment,
} from "@/lib/investment-actions";
import { INVESTMENT_TYPES } from "@/lib/investments";

type HoldingValues = {
  id?: string;
  name: string;
  type: string;
  symbol: string;
  quantity: string;
  avgBuyPrice: string;
  currentPrice: string;
  platform: string;
  notes: string;
};

const emptyHolding: HoldingValues = {
  name: "",
  type: "stock",
  symbol: "",
  quantity: "1",
  avgBuyPrice: "",
  currentPrice: "",
  platform: "",
  notes: "",
};

function HoldingFields({
  values,
  onChange,
}: {
  values: HoldingValues;
  onChange: (next: HoldingValues) => void;
}) {
  function set<K extends keyof HoldingValues>(key: K, value: HoldingValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <>
      <div className="field">
        <label htmlFor="inv-name">Name</label>
        <input
          id="inv-name"
          name="name"
          required
          placeholder="RELIANCE / HDFC Flexi Cap"
          autoFocus
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="inv-type">Type</label>
        <select
          id="inv-type"
          name="type"
          value={values.type}
          onChange={(e) => set("type", e.target.value)}
        >
          {INVESTMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="inv-symbol">Symbol / ticker (optional)</label>
        <input
          id="inv-symbol"
          name="symbol"
          placeholder="RELIANCE.NS"
          value={values.symbol}
          onChange={(e) => set("symbol", e.target.value)}
        />
        <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
          Saved for live prices later — not required now.
        </p>
      </div>
      <div className="field">
        <label htmlFor="inv-qty">Quantity / units</label>
        <input
          id="inv-qty"
          name="quantity"
          type="number"
          step="any"
          min="0"
          required
          inputMode="decimal"
          value={values.quantity}
          onChange={(e) => set("quantity", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="inv-price">Current price (₹ / unit)</label>
        <input
          id="inv-price"
          name="currentPrice"
          type="number"
          step="any"
          min="0"
          required
          inputMode="decimal"
          placeholder="0"
          value={values.currentPrice}
          onChange={(e) => set("currentPrice", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="inv-avg">Avg buy price (optional)</label>
        <input
          id="inv-avg"
          name="avgBuyPrice"
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          placeholder="Cost basis"
          value={values.avgBuyPrice}
          onChange={(e) => set("avgBuyPrice", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="inv-platform">Platform</label>
        <input
          id="inv-platform"
          name="platform"
          placeholder="Zerodha, Groww, bank…"
          value={values.platform}
          onChange={(e) => set("platform", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="inv-notes">Notes (optional)</label>
        <input
          id="inv-notes"
          name="notes"
          placeholder="Demat, folio…"
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
    </>
  );
}

export function AddInvestmentButton() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(emptyHolding);

  function close() {
    setOpen(false);
    setValues(emptyHolding);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={() => setOpen(true)}
      >
        + Add holding
      </button>
      <Modal open={open} title="Add investment" onClose={close} size="md">
        <ActionForm
          action={createInvestment}
          successMessage="Holding added"
          errorMessage="Could not add holding"
          className="form-stack"
          resetOnSuccess
          onSuccess={close}
        >
          <HoldingFields values={values} onChange={setValues} />
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              Save holding
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function EditInvestmentButton({
  holding,
}: {
  holding: {
    id: string;
    name: string;
    type: string;
    symbol: string | null;
    quantityNum: number;
    avgBuyPriceNum: number | null;
    currentPriceNum: number;
    platform: string | null;
    notes: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<HoldingValues>({
    id: holding.id,
    name: holding.name,
    type: holding.type,
    symbol: holding.symbol ?? "",
    quantity: String(holding.quantityNum),
    avgBuyPrice:
      holding.avgBuyPriceNum != null ? String(holding.avgBuyPriceNum) : "",
    currentPrice: String(holding.currentPriceNum),
    platform: holding.platform ?? "",
    notes: holding.notes ?? "",
  });

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
      <Modal
        open={open}
        title="Edit holding"
        onClose={() => setOpen(false)}
        size="md"
      >
        <ActionForm
          action={updateInvestment}
          successMessage="Holding updated"
          errorMessage="Could not update holding"
          className="form-stack"
          onSuccess={() => setOpen(false)}
        >
          <input type="hidden" name="id" value={holding.id} />
          <HoldingFields values={values} onChange={setValues} />
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

export function DeleteInvestmentButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <ActionForm
      action={deleteInvestment}
      successMessage="Holding deleted"
      errorMessage="Could not delete"
      confirmMessage={`Delete “${name}”?`}
    >
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-danger btn-xs" type="submit">
        Del
      </button>
    </ActionForm>
  );
}
