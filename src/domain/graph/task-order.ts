import type { GraphNode, TaskStatus } from "@/domain/graph/types";

export type TaskSortKey = "urgency" | "title" | "status" | "priority" | "due";

/**
 * Which state deserves attention first.
 *
 * Work already started outranks work merely available, because leaving
 * something half-done is worse than not having picked it up. Blocked
 * comes next — you cannot act on it, but it is what the frontier is
 * waiting for. Finished and abandoned work sinks, since the list is for
 * deciding what to do, not for admiring what has been done.
 */
const STATUS_RANK: Record<TaskStatus, number> = {
  IN_PROGRESS: 0,
  READY: 1,
  BLOCKED: 2,
  DONE: 3,
  CANCELLED: 4,
};

/** Absent values sort last in every field, never first. */
function nullsLast(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return 0;
}

function byTitle(a: GraphNode, b: GraphNode): number {
  return a.title.localeCompare(b.title);
}

function byStatus(a: GraphNode, b: GraphNode): number {
  const rank = (node: GraphNode) =>
    node.status ? STATUS_RANK[node.status] : STATUS_RANK.READY;
  return rank(a) - rank(b);
}

/** Urgent (4) before Low (1); unset sinks. */
function byPriority(a: GraphNode, b: GraphNode): number {
  const gap = nullsLast(a.priority, b.priority);
  if (gap !== 0) return gap;
  return (b.priority ?? 0) - (a.priority ?? 0);
}

/** Soonest first; undated sinks. Dates are ISO, so string order works. */
function byDue(a: GraphNode, b: GraphNode): number {
  const gap = nullsLast(a.dueDate ? 1 : null, b.dueDate ? 1 : null);
  if (gap !== 0) return gap;
  if (!a.dueDate || !b.dueDate) return 0;
  return a.dueDate.localeCompare(b.dueDate);
}

/**
 * The default order: what to look at first.
 *
 * State leads, then priority, then the date, then the title so the
 * order is stable — a list that reshuffles between renders is worse
 * than one sorted slightly wrong.
 */
export function compareByUrgency(a: GraphNode, b: GraphNode): number {
  return (
    byStatus(a, b) || byPriority(a, b) || byDue(a, b) || byTitle(a, b)
  );
}

const COMPARATORS: Record<
  TaskSortKey,
  (a: GraphNode, b: GraphNode) => number
> = {
  urgency: compareByUrgency,
  status: (a, b) => byStatus(a, b) || compareByUrgency(a, b),
  priority: (a, b) => byPriority(a, b) || compareByUrgency(a, b),
  due: (a, b) => byDue(a, b) || compareByUrgency(a, b),
  title: byTitle,
};

/**
 * Sorts a copy, never the caller's array. Every key falls back to the
 * urgency order rather than to nothing, so ties are resolved by the
 * question the product is actually about.
 */
export function sortTasks(tasks: GraphNode[], key: TaskSortKey): GraphNode[] {
  return [...tasks].sort(COMPARATORS[key]);
}
