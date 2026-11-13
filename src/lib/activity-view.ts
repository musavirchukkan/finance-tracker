import { toUtcIso } from "@/lib/utc-time";

/** Serializable activity row for the client list. */
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

/** Serialize Date for the client list (safe to call from Server Components). */
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
