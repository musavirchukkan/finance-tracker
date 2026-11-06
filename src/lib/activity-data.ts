import { and, count, desc, eq, lt } from "drizzle-orm";
import { ACTIVITY_MAX_PAGE_SIZE, ACTIVITY_PAGE_SIZE } from "@/lib/constants";
import { db } from "@/lib/db";
import { activityEvents } from "@/lib/db/schema";

export type ActivityEventRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  source: string;
  createdAt: Date;
};

function clampLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return ACTIVITY_PAGE_SIZE;
  return Math.min(Math.max(1, Math.floor(limit)), ACTIVITY_MAX_PAGE_SIZE);
}

/** Owner-scoped activity feed, newest first. Bounded. */
export async function listActivityEvents(
  userId: string,
  opts?: {
    limit?: number;
    /** 1-based page */
    page?: number;
    /** Optional cursor: createdAt ISO — return rows strictly older */
    before?: string;
  },
): Promise<{
  rows: ActivityEventRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const pageSize = clampLimit(opts?.limit);
  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const offset = (page - 1) * pageSize;

  const whereParts = [eq(activityEvents.userId, userId)];
  if (opts?.before) {
    const cursor = new Date(opts.before);
    if (!Number.isNaN(cursor.getTime())) {
      whereParts.push(lt(activityEvents.createdAt, cursor));
    }
  }
  const where = and(...whereParts);

  const [totalRow] = await db
    .select({ n: count() })
    .from(activityEvents)
    .where(where);

  const total = Number(totalRow?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows = await db
    .select({
      id: activityEvents.id,
      action: activityEvents.action,
      entityType: activityEvents.entityType,
      entityId: activityEvents.entityId,
      summary: activityEvents.summary,
      before: activityEvents.before,
      after: activityEvents.after,
      source: activityEvents.source,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(where)
    .orderBy(desc(activityEvents.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    rows: rows.map((r) => ({
      ...r,
      before: (r.before as Record<string, unknown> | null) ?? null,
      after: (r.after as Record<string, unknown> | null) ?? null,
    })),
    total,
    page,
    pageSize,
    totalPages,
  };
}
