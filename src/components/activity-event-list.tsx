"use client";

import { useState } from "react";
import { LocalDateTime } from "@/components/local-datetime";
import { toUtcIso } from "@/lib/utc-time";

export type ActivityEventView = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  source: string;
  createdAt: string;
};

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

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
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
              <td>{formatValue(b)}</td>
              <td>{formatValue(a)}</td>
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
                  <LocalDateTime iso={event.createdAt} />
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

/** Server helper: serialize Date for the client list. */
export function toActivityEventView(row: {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  source: string;
  createdAt: Date;
}): ActivityEventView {
  return {
    ...row,
    createdAt: toUtcIso(row.createdAt) ?? new Date(0).toISOString(),
  };
}
