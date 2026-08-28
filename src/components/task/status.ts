import type { Priority, TaskStatus } from "@/domain/graph/types";

/**
 * The statuses a person is allowed to choose.
 *
 * BLOCKED is absent on purpose: it is derived by the Status Engine from
 * the shape of the graph, never picked. Anywhere that offers a status
 * offers these four and shows BLOCKED only as a state it is currently
 * in — which is why this type, not TaskStatus, is what every status
 * control speaks.
 */
export type SettableStatus = "READY" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export const SETTABLE_STATUSES: SettableStatus[] = [
  "READY",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
];

/**
 * Every column a board shows, in the order work moves through them.
 * BLOCKED leads because it is where work waits before it can begin, and
 * the board should show what is stuck rather than hide it.
 */
export const BOARD_STATUSES: TaskStatus[] = ["BLOCKED", ...SETTABLE_STATUSES];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  BLOCKED: "Blocked",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

/**
 * One palette for state, shared by the panel's chip, the list's badge
 * and the board's columns — the same colours the graph uses for the
 * same states, so a task doesn't change identity when you change view.
 */
export const STATUS_TONE: Record<TaskStatus, string> = {
  BLOCKED: "text-danger border-danger/30 bg-danger-soft",
  READY: "text-accent border-accent/40 bg-accent-soft",
  IN_PROGRESS: "text-warning border-warning/40 bg-warning-soft",
  DONE: "text-success border-success/40 bg-success-soft",
  CANCELLED: "text-text-faint border-border",
};

/** Just the ink, for places that carry their own frame (a board header). */
export const STATUS_INK: Record<TaskStatus, string> = {
  BLOCKED: "text-danger",
  READY: "text-accent",
  IN_PROGRESS: "text-warning",
  DONE: "text-success",
  CANCELLED: "text-text-faint",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

/**
 * Priority is a ramp, not a set of categories, so it reads as one:
 * cool and quiet at the bottom, hot at the top.
 */
export const PRIORITY_TONE: Record<Priority, string> = {
  1: "text-text-faint",
  2: "text-text-muted",
  3: "text-warning",
  4: "text-danger",
};

/** A task's state as the panel and the graph agree it is. */
export function statusOf(status: TaskStatus | null): TaskStatus {
  return status ?? "READY";
}
