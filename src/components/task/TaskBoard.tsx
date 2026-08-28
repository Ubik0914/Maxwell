"use client";

import { useMemo, useState } from "react";
import type { GraphEdge, GraphNode, TaskStatus } from "@/domain/graph/types";
import { buildBlockerMap } from "@/domain/graph/blockers";
import { sortTasks } from "@/domain/graph/task-order";
import { countByStatus, matchesQuery, onlyTasks } from "@/features/tasks/filter";
import { useCardDrag } from "@/features/tasks/hooks/useCardDrag";
import { useTaskStatusMutation } from "@/features/tasks/hooks/useTaskStatusMutation";
import {
  BOARD_STATUSES,
  STATUS_INK,
  STATUS_LABEL,
  statusOf,
  type SettableStatus,
} from "@/components/task/status";
import { TaskCard } from "@/components/task/TaskCard";
import {
  TaskFilterBar,
  type StatusFilter,
} from "@/components/task/TaskFilterBar";
import { TaskPanel } from "@/components/graph/TaskPanel";
import { useToast } from "@/components/Toast";

/** The columns a card can actually be dropped into. */
const DROPPABLE = BOARD_STATUSES.filter(
  (status): status is SettableStatus => status !== "BLOCKED",
);

/**
 * The story as a board.
 *
 * Five columns, BLOCKED first — a Kanban board normally starts at
 * "todo", but here the leftmost column is the one the graph fills by
 * itself, and seeing how much work is dammed up behind unfinished
 * dependencies is the point of having built a DAG in the first place.
 *
 * That column is read-only in both directions: BLOCKED belongs to the
 * Status Engine, which derives it from what a task is waiting on. You
 * can drag a card *out* of it (cancelling blocked work is a legitimate
 * decision, and the engine refuses the moves that aren't), but nothing
 * can be dropped in — the way to block a task is to give it a
 * dependency, on the graph.
 *
 * Columns hold their own sort (urgency order) rather than a manual one:
 * there is no per-column rank in the schema, and inventing one that only
 * lived in the browser would be a lie about what had been saved.
 */
export function TaskBoard({
  nodes,
  edges,
  today,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { showError } = useToast();
  const { changeStatus, flashClass } = useTaskStatusMutation();

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
      tasks: sortTasks(byStatus.get(status) ?? [], "urgency"),
    }));
  }, [tasks, query]);

  function move(taskId: string, target: string) {
    if (target === "BLOCKED") {
      showError(
        "Blocked is set by the graph — add or complete a dependency instead.",
      );
      return;
    }
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task || statusOf(task.status) === target) return;
    changeStatus(taskId, target as SettableStatus);
  }

  const { drag, start } = useCardDrag({ onDrop: move });

  /** Arrow keys on the grip: the same move, one column at a time. */
  function nudge(task: GraphNode, direction: -1 | 1) {
    const from = statusOf(task.status);
    const index = DROPPABLE.indexOf(from as SettableStatus);
    // A BLOCKED card isn't in the droppable list; a nudge right takes it
    // to the first column it is allowed to be in.
    const next = index === -1 ? (direction === 1 ? 0 : -1) : index + direction;
    if (next < 0 || next >= DROPPABLE.length) return;
    changeStatus(task.id, DROPPABLE[next]);
  }

  const flying = drag
    ? (tasks.find((task) => task.id === drag.taskId) ?? null)
    : null;

  const selected = selectedId
    ? (nodes.find((node) => node.id === selectedId) ?? null)
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
                drag?.over === column.status && column.status === "BLOCKED";
              const isOver =
                drag?.over === column.status && column.status !== "BLOCKED";

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
                        onOpen={() => setSelectedId(task.id)}
                        onGrab={(event) => start(event, task.id)}
                        onNudge={(direction) => nudge(task, direction)}
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

      {selected && (
        <TaskPanel
          key={selected.id}
          node={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
