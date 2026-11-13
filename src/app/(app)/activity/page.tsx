import Link from "next/link";
import { ActivityEventList } from "@/components/activity-event-list";
import { InfoTip } from "@/components/info-tip";
import { listActivityEvents } from "@/lib/activity-data";
import { toActivityEventView } from "@/lib/activity-view";
import { ACTIVITY_PAGE_SIZE } from "@/lib/constants";
import { requireUser } from "@/lib/session";

function buildActivityHref(page: number) {
  if (page <= 1) return "/activity";
  return `/activity?page=${page}`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total, totalPages, pageSize } = await listActivityEvents(
    user.id,
    { page, limit: ACTIVITY_PAGE_SIZE },
  );

  const events = rows.map(toActivityEventView);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Activity</h2>
          <p className="muted">
            Your recent creates, edits, and deletes — with before/after values
            for debugging.
          </p>
        </div>
        <InfoTip title="Activity log" label="About activity">
          <p>
            Each mutation stores a short summary plus snapshots of what changed.
            Unexpected crashes are reported separately via Sentry when
            configured.
          </p>
        </InfoTip>
      </div>

      <ActivityEventList events={events} />

      {total > 0 ? (
        <div className="pagination activity-pagination">
          <p className="muted">
            {total} event{total === 1 ? "" : "s"} · page {page} of {totalPages}{" "}
            ({pageSize}/page)
          </p>
          {page > 1 ? (
            <Link href={buildActivityHref(page - 1)}>Previous</Link>
          ) : (
            <span className="muted" aria-disabled>
              Previous
            </span>
          )}
          {page < totalPages ? (
            <Link href={buildActivityHref(page + 1)}>Next</Link>
          ) : (
            <span className="muted" aria-disabled>
              Next
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
