import type { GraphNode, TaskStatus } from "@/domain/graph/types";
import { statusOf } from "@/components/task/status";

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
