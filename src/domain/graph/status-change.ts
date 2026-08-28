import type { SettableStatus, TaskStatus } from "@/domain/graph/types";

export interface StatusChangeRefusal {
  code: "TASK_BLOCKED";
  message: string;
}

export type StatusChangeResult =
  | { allowed: true }
  | { allowed: false; error: StatusChangeRefusal };

/**
 * Which states a task may be moved into, given what its dependencies
 * currently say.
 *
 * While a task is waiting on work that isn't finished, the only move
 * anyone may make is to cancel it. Not start it, not complete it, and —
 * the part that used to be missing — not mark it Ready either.
 *
 * Ready is not a wish, it is a fact about the graph: it means the work
 * in front of this task is done and you could pick it up now. Letting
 * someone assert it by hand makes the word mean two different things
 * depending on who last touched the record, and puts tasks on the
 * frontier that nobody can actually start. The engine promotes
 * BLOCKED -> READY on its own the moment the last thing in the way turns
 * DONE (see recalculateDownstream), so there is nothing to assert.
 *
 * Cancelling is the exception because it is a decision about the task
 * rather than a claim about the graph: abandoning work you are blocked
 * on is exactly when you would want to.
 *
 * `availability` must be the dependency-derived value from
 * calculateTaskAvailability, never the stored status field — a stored
 * status can be stale (a dependency reverted after this task was already
 * READY), and trusting it would let the guard be walked around.
 */
export function validateStatusChange(
  target: SettableStatus,
  availability: "READY" | "BLOCKED",
): StatusChangeResult {
  if (availability === "READY" || target === "CANCELLED") {
    return { allowed: true };
  }

  return {
    allowed: false,
    error: {
      code: "TASK_BLOCKED",
      message:
        target === "READY"
          ? "This task is waiting on work that isn't finished. It becomes Ready on its own once that work is done."
          : "Complete the blocking tasks before starting this task.",
    },
  };
}

/**
 * The same rule stated for a control that has only the stored status to
 * go on — a picker, a menu, a board column.
 *
 * `BLOCKED` is what the engine writes when a task is waiting, so it is
 * the honest proxy for "the graph says no" on the client. Offering a
 * move this returns false for would be offering a way to be told no,
 * and the server would tell you so on the round-trip anyway.
 *
 * It is a courtesy, not a guard: validateStatusChange, which re-derives
 * availability from the graph rather than trusting a stored field, is
 * the one that decides.
 */
export function canRequestStatus(
  current: TaskStatus,
  target: SettableStatus,
): boolean {
  return current !== "BLOCKED" || target === "CANCELLED";
}
