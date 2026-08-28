"use client";

import { useMemo, useState } from "react";
import type { GraphNode, TaskStatus } from "@/domain/graph/types";
import { buildBlockerMap } from "@/domain/graph/blockers";
import { canRequestStatus } from "@/domain/graph/status-change";
import { sortTasks } from "@/domain/graph/task-order";
import { countByStatus, matchesQuery, onlyTasks } from "@/features/tasks/filter";
import { useCardDrag, type DropTarget } from "@/features/tasks/hooks/useCardDrag";
import { usePendingGraph } from "@/features/graph/pending-graph";
import { useTaskActions } from "@/features/tasks/hooks/useTaskActions";
import {
  BOARD_STATUSES,
  STATUS_INK,
  STATUS_LABEL,
  statusOf,
  type SettableStatus,
} from "@/components/task/status";
import { TaskCard } from "@/components/task/TaskCard";
import { TaskOverlays } from "@/components/task/TaskOverlays";
import {
  TaskFilterBar,
  type StatusFilter,
} from "@/components/task/TaskFilterBar";
import { useToast } from "@/components/Toast";

/** The columns a card can actually be dropped into. */
const DROPPABLE = BOARD_STATUSES.filter(
  (status): status is SettableStatus => status !== "BLOCKED",
);

/**
 * The story as a board.
 *
 * Five columns, ending at BLOCKED — the states you can move through
 * come first, and what the graph is holding back sits at the far end,
 * where you go looking for it rather than being handed it.
 *
 * That column is read-only in one direction: BLOCKED belongs to the
 * Status Engine, which derives it from what a task is waiting on. You
 * can drag a card *out* of it (cancelling blocked work is a legitimate
 * decision, and the engine refuses the moves that aren't), but nothing
 * can be dropped in — the way to block a task is to give it a
 * dependency, on the graph.
 *
 * Cards can be dragged within a column as well as between them. The
 * rank behind that is story-wide, not per column, so a card keeps its
 * place when you move it to In progress and back — which is what you
 * want, and what a per-column rank could not give you.
 */
export function TaskBoard({
  storyId,
  today,
}: {
  storyId: string;
  today: string;
}) {
  // The story as it should be drawn right now — the server's answer
  // plus anything asked for since. See PendingGraphProvider.
  const { nodes: serverNodes, edges } = usePendingGraph();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const { showError } = useToast();
  // `actions.nodes` already carries any status change still in flight,
  // so a dropped card is in its new column before the server answers.
  const actions = useTaskActions(serverNodes, storyId);
  const { nodes, changeStatus, flashClass } = actions;

  const tasks = useMemo(() => onlyTasks(nodes), [nodes]);
  const blockers = useMemo(() => buildBlockerMap(nodes, edges), [nodes, edges]);
  const counts = useMemo(() => countByStatus(tasks), [tasks]);

  const columns = useMemo(() => {
    const byStatus = new Map<TaskStatus, GraphNode[]>(
      BOARD_STATUSES.map((status) => [status, []]),
    );
    for (const task of tasks) {
      if (!matchesQuery(task, query)) continue;
      byStatus.get(statusOf(task.status))?.push(task);
    }
    return BOARD_STATUSES.map((status) => ({
      status,
      // Manual rank first, urgency among whatever nobody has placed —
      // so a column reads as the order it was arranged in, and a new
      // task still arrives somewhere sensible rather than at the top.
      tasks: sortTasks(byStatus.get(status) ?? [], "manual"),
    }));
  }, [tasks, query]);

  function drop(taskId: string, target: DropTarget) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;

    if (target.zone === "BLOCKED") {
      showError(
        "Blocked is set by the graph — add or complete a dependency instead.",
      );
      return;
    }

    // A blocked card can be cancelled and nothing else. Said here as
    // well as on the server so the card does not travel to a column,
    // sit there for a round-trip and then jump back.
    if (!canRequestStatus(statusOf(task.status), target.zone as SettableStatus)) {
      showError(
        "This task is waiting on work that isn't finished. It becomes Ready on its own once that work is done.",
      );
      return;
    }

    // Position always, status only when the column actually changed.
    // Dropping a card two places up inside its own column is a
    // reordering, not a state change, and writing the status it already
    // has would send the whole graph through the Status Engine for
    // nothing.
    const column = columns.find((c) => c.status === target.zone);
    actions.reorder(taskId, column?.tasks ?? [], target.index);

    if (statusOf(task.status) !== target.zone) {
      changeStatus(taskId, target.zone as SettableStatus);
    }
  }

  const { drag, start } = useCardDrag({ onDrop: drop });

  /** Arrow keys on the grip: the same move, one column at a time. */
  function nudge(task: GraphNode, direction: -1 | 1) {
    const from = statusOf(task.status);
    const index = DROPPABLE.indexOf(from as SettableStatus);
    // A BLOCKED card isn't in the droppable list; a nudge right takes it
    // to the first column it is allowed to be in.
    const next = index === -1 ? (direction === 1 ? 0 : -1) : index + direction;
    if (next < 0 || next >= DROPPABLE.length) return;
    if (!canRequestStatus(from, DROPPABLE[next])) return;
    changeStatus(task.id, DROPPABLE[next]);
  }

  const flying = drag
    ? (tasks.find((task) => task.id === drag.taskId) ?? null)
    : null;


  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <TaskFilterBar
        query={query}
        onQueryChange={setQuery}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        counts={counts}
        total={tasks.length}
      />

      {/* One horizontal scroller holding five vertical ones. Columns keep
          a fixed width instead of sharing the viewport, because five
          columns squeezed onto a phone are five columns nobody can
          read. */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 py-3 sm:px-5">
        <div className="flex h-full min-h-0 gap-3">
          {columns
            .filter(
              (column) =>
                statusFilter === null || column.status === statusFilter,
            )
            .map((column) => {
              const isRefusing =
                drag?.over?.zone === column.status && column.status === "BLOCKED";
              const isOver =
                drag?.over?.zone === column.status && column.status !== "BLOCKED";

              return (
                <section
                  key={column.status}
                  data-drop-zone={column.status}
                  aria-label={STATUS_LABEL[column.status]}
                  className={`flex h-full w-64 shrink-0 flex-col rounded-xl border border-border bg-bg transition-colors sm:w-72 ${
                    isOver ? "board-column-over" : ""
                  } ${isRefusing ? "board-column-refuse" : ""}`}
                >
                  <h2 className="flex shrink-0 items-center gap-2 px-3 py-2">
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full bg-current ${STATUS_INK[column.status]}`}
                    />
                    <span
                      className={`text-[10px] font-semibold tracking-[0.14em] uppercase ${STATUS_INK[column.status]}`}
                    >
                      {STATUS_LABEL[column.status]}
                    </span>
                    <span className="ml-auto text-xs tabular-nums text-text-faint">
                      {column.tasks.length}
                    </span>
                  </h2>

                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                    {column.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        blockers={blockers.get(task.id) ?? []}
                        today={today}
                        isLifted={drag?.taskId === task.id}
                        flashClass={flashClass(task.id, "state-changed")}
                        onOpen={() => actions.select(task.id)}
                        onGrab={(event) => start(event, task.id)}
                        onNudge={(direction) => nudge(task, direction)}
                        onAddNext={() => actions.askAddAfter(task.id)}
                        onLongPress={(point) => actions.openMenu(task, point)}
                      />
                    ))}
                    {column.tasks.length === 0 && (
                      <p className="px-1 py-6 text-center text-xs text-text-faint">
                        {column.status === "BLOCKED"
                          ? "Nothing is waiting."
                          : "Empty"}
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
        </div>
      </div>

      {/* The card in hand. Rendered once, outside the columns, so it is
          never clipped by the scroller it came out of. */}
      {drag && flying && (
        <div
          style={{
            left: drag.x,
            top: drag.y,
            width: drag.width,
          }}
          className="board-card-flying"
        >
          <TaskCard
            task={flying}
            blockers={blockers.get(flying.id) ?? []}
            today={today}
            isFlying
          />
        </div>
      )}

      <TaskOverlays actions={actions} edges={edges} today={today} />
    </div>
  );
}
