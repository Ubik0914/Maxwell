"use client";

import { useMemo, useState } from "react";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";
import { buildBlockerMap } from "@/domain/graph/blockers";
import { sortTasks, type TaskSortKey } from "@/domain/graph/task-order";
import {
  countByStatus,
  matchesQuery,
  onlyTasks,
  stepFilter,
} from "@/features/tasks/filter";
import { useTaskActions } from "@/features/tasks/hooks/useTaskActions";
import { useCardDrag, type DropTarget } from "@/features/tasks/hooks/useCardDrag";
import { statusOf } from "@/components/task/status";
import { TaskRow } from "@/components/task/TaskRow";
import { TaskOverlays } from "@/components/task/TaskOverlays";
import {
  TaskFilterBar,
  type StatusFilter,
} from "@/components/task/TaskFilterBar";
import { useSwipeFilter } from "@/hooks/useSwipeFilter";
import { GripIcon } from "@/components/icons";

interface Column {
  /** null where the column has nothing to sort by — see below. */
  key: TaskSortKey | null;
  label: string;
  /** Which widths this column survives at, plus how wide it wants to be. */
  show: string;
}

/**
 * "Waiting on" and "Assignee" are deliberately not sortable. Both would
 * need an order the domain doesn't define — blockers by count says
 * nothing useful, and assignee is a raw uuid until there are profiles to
 * sort by name. A header that looks clickable and sorts by something
 * arbitrary is worse than one that plainly doesn't.
 *
 * `w-full` on Task with `whitespace-nowrap` on the rest is the auto
 * table-layout idiom for "this column takes what's left": every other
 * column asks for exactly its content, and the leftover lands here. The
 * matching `max-w-0` on the cell is what then lets the title truncate
 * instead of widening the column past the table.
 */
const COLUMNS: Column[] = [
  { key: "status", label: "Status", show: "whitespace-nowrap" },
  { key: "title", label: "Task", show: "w-full" },
  { key: null, label: "Waiting on", show: "hidden w-40 lg:table-cell" },
  { key: "priority", label: "Priority", show: "hidden whitespace-nowrap sm:table-cell" },
  { key: "due", label: "Due", show: "hidden whitespace-nowrap sm:table-cell" },
  { key: null, label: "Assignee", show: "hidden whitespace-nowrap lg:table-cell" },
  { key: null, label: "", show: "w-px" },
];

/**
 * The story as a list you can work through.
 *
 * The graph answers "how does this fit together"; this answers "what do
 * I do next, and what is in the way" — so it opens in urgency order
 * (see task-order) rather than in creation order, and it carries the one
 * column no flat task list can have: what each task is waiting on.
 *
 * Status is editable in place, a long press opens the full set of
 * actions, and everything else opens the same TaskPanel the graph uses,
 * because there should be exactly one place a task is edited, not a
 * second half-form here.
 */
export function TaskTable({
  nodes: serverNodes,
  edges,
  storyId,
  today,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  storyId: string;
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  /** Which way the last filter change came from, for the slide-in. */
  const [enterFrom, setEnterFrom] = useState<-1 | 1 | 0>(0);
  const [sortKey, setSortKey] = useState<TaskSortKey>("urgency");
  const [isDescending, setIsDescending] = useState(false);
  // `actions.nodes` already carries any status change still in flight,
  // so everything below — the order, the counts, the blockers —
  // reflects the press rather than the round-trip.
  const actions = useTaskActions(serverNodes, storyId);
  const { nodes } = actions;

  const tasks = useMemo(() => onlyTasks(nodes), [nodes]);
  const blockers = useMemo(() => buildBlockerMap(nodes, edges), [nodes, edges]);
  const counts = useMemo(() => countByStatus(tasks), [tasks]);

  const visible = useMemo(() => {
    const filtered = tasks.filter(
      (task) =>
        matchesQuery(task, query) &&
        (statusFilter === null || statusOf(task.status) === statusFilter),
    );
    const sorted = sortTasks(filtered, sortKey);
    return isDescending ? sorted.reverse() : sorted;
  }, [tasks, query, statusFilter, sortKey, isDescending]);

  // Only a hand-made order can be rearranged by hand. Dragging a row
  // while the list is sorted by due date would either lie (the row
  // springs back) or silently switch the sort out from under you.
  const isManual = sortKey === "manual";

  const { drag, start } = useCardDrag({
    onDrop: (taskId: string, target: DropTarget) =>
      actions.reorder(taskId, visible, target.index),
  });

  /**
   * The filters are a row of siblings, so a phone can move along them
   * with a thumb instead of reaching for a chip. Stops at both ends
   * rather than wrapping: running off the edge of a list and landing
   * back at the start is disorienting, and the end is worth feeling.
   */
  function step(direction: -1 | 1) {
    const next = stepFilter(statusFilter, direction);
    if (next === undefined) return;
    setStatusFilter(next);
    setEnterFrom(direction);
  }

  const swipe = useSwipeFilter({ onSwipe: step });

  function sortBy(key: TaskSortKey) {
    if (key === sortKey) {
      setIsDescending((prev) => !prev);
      return;
    }
    setSortKey(key);
    setIsDescending(false);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <TaskFilterBar
        query={query}
        onQueryChange={setQuery}
        status={statusFilter}
        onStatusChange={(next) => {
          setStatusFilter(next);
          setEnterFrom(0);
        }}
        counts={counts}
        total={tasks.length}
      >
        <button
          type="button"
          onClick={() => sortBy(isManual ? "urgency" : "manual")}
          aria-pressed={isManual}
          title={
            isManual
              ? "Back to urgency order"
              : "Arrange these by hand"
          }
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${
            isManual
              ? "border-accent bg-accent-soft text-accent"
              : "border-border text-text-muted hover:border-border-strong hover:text-text"
          }`}
        >
          <GripIcon className="h-3.5 w-3.5" />
          Manual
        </button>
      </TaskFilterBar>

      <div
        {...swipe}
        // Keyed on the filter so React remounts it and the animation
        // replays; without the key a class alone only ever fires once.
        key={statusFilter ?? "ALL"}
        className={`min-h-0 flex-1 overflow-auto ${
          enterFrom === 1
            ? "pane-from-right"
            : enterFrom === -1
              ? "pane-from-left"
              : ""
        }`}
      >
        {visible.length === 0 ? (
          <EmptyState hasTasks={tasks.length > 0} />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-bg">
              <tr className="border-b border-border text-left">
                {/* The handle column only exists in manual order, so the
                    header has to grow one too or every cell below it
                    lands under the wrong heading. */}
                {isManual && <th scope="col" className="w-px" />}
                {COLUMNS.map((column) => {
                  const isSorted = column.key !== null && sortKey === column.key;
                  const heading = (
                    <span
                      className={`flex items-center gap-1 text-[10px] tracking-[0.12em] uppercase transition-colors group-hover:text-text ${
                        isSorted ? "text-accent" : "text-text-faint"
                      }`}
                    >
                      {column.label}
                      {isSorted && (
                        <span aria-hidden="true">
                          {isDescending ? "▾" : "▴"}
                        </span>
                      )}
                    </span>
                  );

                  return (
                    <th
                      key={column.label}
                      scope="col"
                      aria-sort={
                        column.key === null
                          ? undefined
                          : isSorted
                            ? isDescending
                              ? "descending"
                              : "ascending"
                            : "none"
                      }
                      className={`px-3 py-2 font-normal ${column.show}`}
                    >
                      {column.key === null ? (
                        heading
                      ) : (
                        <button
                          type="button"
                          onClick={() => sortBy(column.key!)}
                          className="group"
                        >
                          {heading}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody data-drop-zone="LIST">
              {visible.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  blockers={blockers.get(task.id) ?? []}
                  today={today}
                  isSelected={actions.selectedId === task.id}
                  flashClass={actions.flashClass(task.id, "row-changed")}
                  onOpen={() => actions.select(task.id)}
                  onAddNext={() => actions.askAddAfter(task.id)}
                  onStatusChange={(next) => actions.changeStatus(task.id, next)}
                  onLongPress={(point) => actions.openMenu(task, point)}
                  isLifted={drag?.taskId === task.id}
                  onGrab={
                    isManual
                      ? (event) => start(event, task.id)
                      : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TaskOverlays actions={actions} edges={edges} today={today} />
    </div>
  );
}

function EmptyState({ hasTasks }: { hasTasks: boolean }) {
  return (
    <p className="px-5 py-16 text-center text-sm text-text-faint">
      {hasTasks
        ? "No tasks match this filter."
        : "This story has no tasks yet. Add one on the graph."}
    </p>
  );
}
