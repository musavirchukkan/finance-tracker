"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type OverviewReminder = {
  message: string;
  href?: string;
  severity: "warn" | "urgent";
  kind: "unpaid" | "overdue";
};

function toneClass(reminder: OverviewReminder) {
  if (reminder.kind === "overdue" || reminder.severity === "urgent") {
    return "is-overdue";
  }
  return "is-warn";
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

function DangerIcon() {
  return (
    <svg {...iconProps}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function OkIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ReminderIcon({
  reminder,
}: {
  reminder: OverviewReminder | null;
}) {
  if (!reminder) return <OkIcon />;
  if (reminder.kind === "overdue" || reminder.severity === "urgent") {
    return <DangerIcon />;
  }
  return <WarningIcon />;
}

function ReminderCarousel({ reminders }: { reminders: OverviewReminder[] }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (reminders.length <= 1) return;

    let swapTimer = 0;
    const id = window.setInterval(() => {
      setPhase("out");
      window.clearTimeout(swapTimer);
      swapTimer = window.setTimeout(() => {
        setIndex((i) => (i + 1) % reminders.length);
        setPhase("in");
      }, 280);
    }, 5500);

    return () => {
      window.clearInterval(id);
      window.clearTimeout(swapTimer);
    };
  }, [reminders.length]);

  const current = reminders[Math.min(index, reminders.length - 1)]!;

  return (
    <div
      className={`overview-reminders ${toneClass(current)}`}
      role="status"
      aria-live="polite"
    >
      <span
        key={`icon-${index}-${current.kind}`}
        className={
          phase === "out"
            ? "overview-reminder-mark is-out"
            : "overview-reminder-mark is-in"
        }
        aria-hidden
      >
        <ReminderIcon reminder={current} />
      </span>
      <div className="overview-reminder-body">
        <div
          key={`${index}-${current.message}`}
          className={
            phase === "out"
              ? "overview-reminder-swap is-out"
              : "overview-reminder-swap is-in"
          }
        >
          <p className="overview-reminder-text">
            {current.href ? (
              <Link className="overview-reminder-link" href={current.href}>
                {current.message}
              </Link>
            ) : (
              <span>{current.message}</span>
            )}
          </p>
        </div>
        {reminders.length > 1 ? (
          <span className="overview-reminder-count">
            {index + 1} / {reminders.length}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** One reminder at a time — rotates with a short slide/fade when there are several. */
export function OverviewReminders({
  reminders,
}: {
  reminders: OverviewReminder[];
}) {
  if (reminders.length === 0) {
    return (
      <div className="overview-reminders is-clear" role="status">
        <span className="overview-reminder-mark" aria-hidden>
          <OkIcon />
        </span>
        <p className="overview-reminder-text">
          No payment reminders right now
        </p>
      </div>
    );
  }

  // Remount when the reminder set changes so carousel state resets without an effect.
  const resetKey = reminders.map((r) => `${r.kind}:${r.message}`).join("|");
  return <ReminderCarousel key={resetKey} reminders={reminders} />;
}
