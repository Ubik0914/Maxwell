import type { GraphNode, Priority } from "@/domain/graph/types";
import { PRIORITY_LABEL, PRIORITY_TONE } from "@/components/task/status";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * "2026-08-28" -> "Aug 28", with the year only when it isn't the
 * current one.
 *
 * Formatted by hand rather than with toLocaleDateString, which resolves
 * differently in Node and in the browser: these components are rendered
 * on both, and a date that changes shape at hydration is a mismatch
 * warning at best and a visible flicker at worst.
 */
export function formatDue(iso: string, today: string): string {
  const [year, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1] ?? month;
  const label = `${name} ${Number(day)}`;
  return year === today.slice(0, 4) ? label : `${label} ${year}`;
}

/**
 * A due date, louder once it has passed.
 *
 * Overdue is the only thing on a task that gets worse on its own while
 * nobody touches it, so it is the only field allowed to raise its voice
 * without a state change behind it.
 */
export function DueDate({
  dueDate,
  today,
  status,
}: {
  dueDate: string;
  today: string;
  status: GraphNode["status"];
}) {
  // Finished work can't be late. Nagging about the due date of a task
  // that is already DONE is noise about a decision nobody has to make.
  const isSettled = status === "DONE" || status === "CANCELLED";
  const isOverdue = !isSettled && dueDate < today;
  const isToday = !isSettled && dueDate === today;

  return (
    <span
      title={isOverdue ? `Overdue — due ${dueDate}` : `Due ${dueDate}`}
      className={`whitespace-nowrap tabular-nums ${
        isOverdue
          ? "font-medium text-danger"
          : isToday
            ? "font-medium text-warning"
            : "text-text-muted"
      }`}
    >
      {formatDue(dueDate, today)}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: Priority }) {
  return (
    <span className={`text-xs ${PRIORITY_TONE[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/**
 * What a task is waiting on, named.
 *
 * This is the whole reason a Maxwell list isn't just a list: "Blocked"
 * is a state, "waiting on Deploy staging" is an instruction about where
 * to go next. Long chains truncate to a count rather than wrapping — if
 * five things are in the way, the number is the useful part and the
 * detail belongs on the graph.
 */
export function WaitingOn({
  blockers,
  className = "",
}: {
  blockers: GraphNode[];
  className?: string;
}) {
  if (blockers.length === 0) {
    return <span className={`text-text-faint ${className}`}>—</span>;
  }

  const names = blockers.map((b) => b.title).join(", ");

  return (
    <span
      title={names}
      className={`inline-flex min-w-0 items-baseline gap-1 text-text-muted ${className}`}
    >
      <span
        aria-hidden="true"
        className="h-1 w-1 shrink-0 translate-y-[-0.15em] rounded-full bg-danger"
      />
      <span className="truncate">
        {blockers.length === 1 ? blockers[0].title : `${blockers.length} tasks`}
      </span>
    </span>
  );
}

/**
 * An assignee, shown as initials when there's no room for more.
 *
 * assigneeId is a raw uuid today — there is no profile lookup yet — so
 * the honest thing is a short, stable stub with the full value on hover
 * rather than a fake name.
 */
export function Assignee({ assigneeId }: { assigneeId: string | null }) {
  if (!assigneeId) {
    return <span className="text-text-faint">—</span>;
  }

  return (
    <span
      title={assigneeId}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-hover text-[10px] font-medium tracking-tight text-text-muted uppercase"
    >
      {assigneeId.slice(0, 2)}
    </span>
  );
}
