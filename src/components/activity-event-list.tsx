"use client";

import { useState } from "react";
import { LocalDateTime } from "@/components/local-datetime";
import type { ActivityEventView } from "@/lib/activity-view";
import { formatUtcAsLocal } from "@/lib/utc-time";

export type { ActivityEventView };

const SNAPSHOT_KEYS = [
  "type",
  "amount",
  "date",
  "description",
  "categoryId",
  "bankAccountId",
  "transferToBankAccountId",
  "creditCardId",
  "cardBillPayId",
] as const;

function looksLikeInstant(value: string): boolean {
  return /T\d{2}:\d{2}/.test(value) || /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(value);
}

function formatValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (key === "date" && typeof value === "string" && looksLikeInstant(value)) {
    return formatUtcAsLocal(value, { seconds: true });
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}

function DiffTable({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const keys = new Set<string>([
    ...SNAPSHOT_KEYS,
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  const rows = [...keys].filter((key) => {
    const b = before?.[key];
    const a = after?.[key];
    return b !== undefined || a !== undefined;
  });

  if (rows.length === 0) {
    return <p className="muted">No snapshot details.</p>;
  }

  return (
    <table className="activity-diff-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((key) => {
          const b = before?.[key];
          const a = after?.[key];
          const changed =
            JSON.stringify(b ?? null) !== JSON.stringify(a ?? null);
          return (
            <tr key={key} className={changed ? "changed" : undefined}>
              <td>{key}</td>
              <td>{formatValue(key, b)}</td>
              <td>{formatValue(key, a)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ActivityEventList({ events }: { events: ActivityEventView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <p className="muted empty-state">
        No activity yet. Creates, edits, and deletes of transactions will show
        up here.
      </p>
    );
  }

  return (
    <ul className="activity-list">
      {events.map((event) => {
        const open = openId === event.id;
        return (
          <li key={event.id} className="activity-item">
            <button
              type="button"
              className="activity-item-toggle"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : event.id)}
            >
              <span className="activity-item-main">
                <strong>{event.summary}</strong>
                <span className="muted activity-item-meta">
                  <LocalDateTime iso={event.createdAt} seconds />
                  <span aria-hidden="true"> · </span>
                  {event.source}
                  <span aria-hidden="true"> · </span>
                  {event.action}
                </span>
              </span>
              <span className="muted">{open ? "Hide" : "Details"}</span>
            </button>
            {open ? (
              <div className="activity-item-detail">
                {event.entityId ? (
                  <p className="muted activity-entity-id">
                    Entity: {event.entityId}
                  </p>
                ) : null}
                <DiffTable before={event.before} after={event.after} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
