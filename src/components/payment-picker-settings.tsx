"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { updatePaymentPickerVisibility } from "@/lib/payment-picker-actions";

type PickerItem = {
  id: string;
  label: string;
  showInPaymentPicker: boolean;
  /** Extra muted line under the label (e.g. Inactive). */
  note?: string | null;
};

function mapShown(items: PickerItem[]) {
  return Object.fromEntries(items.map((i) => [i.id, i.showInPaymentPicker]));
}

export function PaymentPickerSettings({
  banks,
  cards,
}: {
  banks: PickerItem[];
  cards: PickerItem[];
}) {
  /** null = mirror server props; object = local unsaved edits. */
  const [bankDraft, setBankDraft] = useState<Record<string, boolean> | null>(
    null,
  );
  const [cardDraft, setCardDraft] = useState<Record<string, boolean> | null>(
    null,
  );
  const bankShown = bankDraft ?? mapShown(banks);
  const cardShown = cardDraft ?? mapShown(cards);

  const bankShowCount = Object.values(bankShown).filter(Boolean).length;
  const cardShowCount = Object.values(cardShown).filter(Boolean).length;

  function setAllBanks(show: boolean) {
    setBankDraft(Object.fromEntries(banks.map((b) => [b.id, show])));
  }

  function setAllCards(show: boolean) {
    setCardDraft(Object.fromEntries(cards.map((c) => [c.id, show])));
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Payment lists</h2>
          <p className="muted page-sub" style={{ margin: "0.25rem 0 0" }}>
            Choose which banks and cards appear in Add transaction dropdowns.
            Hidden ones stay on Accounts / Cards. In Add, use “Not listed?
            Show all” when you need one once.
          </p>
        </div>
      </div>

      <ActionForm
        action={updatePaymentPickerVisibility}
        successMessage="Payment lists updated"
        errorMessage="Could not update payment lists"
        className="form-stack"
        onSuccess={() => {
          setBankDraft(null);
          setCardDraft(null);
        }}
      >
        <div className="picker-settings-grid">
          <div className="picker-settings-col">
            <div className="picker-settings-col-head">
              <h3 className="section-sub">
                Bank accounts{" "}
                <span className="muted" style={{ fontWeight: 400 }}>
                  ({bankShowCount}/{banks.length} shown)
                </span>
              </h3>
              <div className="dash-actions" style={{ gap: "0.35rem" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setAllBanks(true)}
                >
                  Show all
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setAllBanks(false)}
                >
                  Hide all
                </button>
              </div>
            </div>
            {banks.length === 0 ? (
              <p className="muted empty">No bank accounts yet.</p>
            ) : (
              <ul className="picker-settings-list">
                {banks.map((b) => (
                  <li key={b.id}>
                    <label className="debt-check-label">
                      <input
                        type="checkbox"
                        name={`bank:${b.id}`}
                        value="true"
                        checked={bankShown[b.id] ?? false}
                        onChange={(e) =>
                          setBankDraft((prev) => ({
                            ...(prev ?? mapShown(banks)),
                            [b.id]: e.target.checked,
                          }))
                        }
                      />
                      <span>
                        {b.label}
                        {b.note ? (
                          <span
                            className="muted"
                            style={{
                              display: "block",
                              fontSize: "0.75rem",
                            }}
                          >
                            {b.note}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="picker-settings-col">
            <div className="picker-settings-col-head">
              <h3 className="section-sub">
                Credit cards{" "}
                <span className="muted" style={{ fontWeight: 400 }}>
                  ({cardShowCount}/{cards.length} shown)
                </span>
              </h3>
              <div className="dash-actions" style={{ gap: "0.35rem" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setAllCards(true)}
                >
                  Show all
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setAllCards(false)}
                >
                  Hide all
                </button>
              </div>
            </div>
            {cards.length === 0 ? (
              <p className="muted empty">No credit cards yet.</p>
            ) : (
              <ul className="picker-settings-list">
                {cards.map((c) => (
                  <li key={c.id}>
                    <label className="debt-check-label">
                      <input
                        type="checkbox"
                        name={`card:${c.id}`}
                        value="true"
                        checked={cardShown[c.id] ?? false}
                        onChange={(e) =>
                          setCardDraft((prev) => ({
                            ...(prev ?? mapShown(cards)),
                            [c.id]: e.target.checked,
                          }))
                        }
                      />
                      <span>
                        {c.label}
                        {c.note ? (
                          <span
                            className="muted"
                            style={{
                              display: "block",
                              fontSize: "0.75rem",
                            }}
                          >
                            {c.note}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: "0.75rem" }}>
          <button type="submit" className="btn btn-primary">
            Save payment lists
          </button>
        </div>
      </ActionForm>
    </section>
  );
}
