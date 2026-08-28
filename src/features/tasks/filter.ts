import type { GraphNode, TaskStatus } from "@/domain/graph/types";
import { BOARD_STATUSES, statusOf } from "@/components/task/status";

/** `null` is "everything" — the absence of a filter, not a sixth state. */
export type StatusFilter = TaskStatus | null;

/**
 * The filters in the order they are shown, which is also the order a
 * swipe walks them.
 */
export const FILTER_ORDER: StatusFilter[] = [null, ...BOARD_STATUSES];

/**
 * The filter one step along, or undefined at either end.
 *
 * Deliberately does not wrap. Running off the edge of a list and
 * landing back at the start is disorienting, and the end of the row is
 * worth being able to feel.
 */
export function stepFilter(
  current: StatusFilter,
  step: -1 | 1,
): StatusFilter | undefined {
  const at = FILTER_ORDER.indexOf(current);
  if (at === -1) return undefined;
  return FILTER_ORDER[at + step];
}

/**
 * Free-text search over a task.
 *
 * Title and description only. Searching ids would match nothing a person
 * ever typed, and searching the assignee — currently a raw uuid — would
 * be the same trick in a different field.
 */
export function matchesQuery(task: GraphNode, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    task.title.toLowerCase().includes(needle) ||
    (task.description?.toLowerCase().includes(needle) ?? false)
  );
}

/** How many tasks sit in each state, for the filter chips' counts. */
export function countByStatus(tasks: GraphNode[]): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    BLOCKED: 0,
    READY: 0,
    IN_PROGRESS: 0,
    DONE: 0,
    CANCELLED: 0,
  };
  for (const task of tasks) counts[statusOf(task.status)] += 1;
  return counts;
}

/** Only TASK nodes are manageable — START and GOAL are the story's ends. */
export function onlyTasks(nodes: GraphNode[]): GraphNode[] {
  return nodes.filter((node) => node.type === "TASK");
}
