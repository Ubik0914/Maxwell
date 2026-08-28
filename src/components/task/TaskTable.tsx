"use client";

import { useMemo, useState } from "react";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";
import { buildBlockerMap } from "@/domain/graph/blockers";
import { sortTasks, type TaskSortKey } from "@/domain/graph/task-order";
import { countByStatus, matchesQuery, onlyTasks } from "@/features/tasks/filter";
import { useTaskStatusMutation } from "@/features/tasks/hooks/useTaskStatusMutation";
import { statusOf } from "@/components/task/status";
import { StatusSelect } from "@/components/task/StatusSelect";
import { AddNextTaskDialog } from "@/components/task/AddNextTaskDialog";
import {
  TaskFilterBar,
  type StatusFilter,
} from "@/components/task/TaskFilterBar";
import {
  Assignee,
  DueDate,
  PriorityTag,
  WaitingOn,
} from "@/components/task/TaskFields";
import { TaskPanel } from "@/components/graph/TaskPanel";
import { PlusIcon } from "@/components/icons";

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
 * The row itself is the thing you press. The title used to be a button
 * inside a clickable row, which is two controls claiming one press and
 * a nested interactive element besides. Only the controls that do
 * something *else* — the status picker, "add next" — are buttons now,
 * and they stop the press from reaching the row.
 *
 * Status is editable in place. Everything else opens the same TaskPanel
 * the graph uses, because there should be exactly one place a task is
 * edited, not a second half-form here.
 */
export function TaskTable({
  nodes: serverNodes,
  edges,
  today,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [sortKey, setSortKey] = useState<TaskSortKey>("urgency");
  const [isDescending, setIsDescending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addAfterId, setAddAfterId] = useState<string | null>(null);
  // `nodes` already carries any status change still in flight, so
  // everything below — the order, the counts, the blockers — reflects
  // the press rather than the round-trip.
  const { nodes, changeStatus, flashClass } =
    useTaskStatusMutation(serverNodes);

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

  const byId = (id: string | null) =>
    id ? (nodes.find((node) => node.id === id) ?? null) : null;

  // Read back out of `nodes` rather than held in state, so a refresh
  // after an edit shows the new values in the open panel.
  const selected = byId(selectedId);
  const addAfter = byId(addAfterId);

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
        onStatusChange={setStatusFilter}
        counts={counts}
        total={tasks.length}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <EmptyState hasTasks={tasks.length > 0} />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-bg">
              <tr className="border-b border-border text-left">
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
            <tbody>
              {visible.map((task) => {
                const status = statusOf(task.status);
                const waiting = blockers.get(task.id) ?? [];
                return (
                  <tr
                    key={task.id}
                    // The row is one control: focusable, pressable, and
                    // named, without a redundant button wrapping the
                    // title inside it.
                    tabIndex={0}
                    aria-label={`Open ${task.title}`}
                    onClick={() => setSelectedId(task.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(task.id);
                      }
                    }}
                    className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none ${
                      selectedId === task.id ? "bg-surface" : ""
                    } ${flashClass(task.id, "row-changed")}`}
                  >
                    {/* The one editable cell. The press that opens a
                        picker must not also open the panel behind it. */}
                    <td
                      className="px-3 py-2 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <StatusSelect
                        id={`status-${task.id}`}
                        status={status}
                        onChange={(next) => changeStatus(task.id, next)}
                      />
                    </td>

                    <td className="w-full max-w-0 px-3 py-2">
                      <span className="block truncate text-text">
                        {task.title}
                      </span>
                      {/* What the hidden columns were carrying, folded
                          back in under the title rather than lost. Each
                          piece appears only below the width its own
                          column returns at, so nothing is shown twice. */}
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs lg:hidden">
                        {task.priority && (
                          <span className="sm:hidden">
                            <PriorityTag priority={task.priority} />
                          </span>
                        )}
                        {task.dueDate && (
                          <span className="sm:hidden">
                            <DueDate
                              dueDate={task.dueDate}
                              today={today}
                              status={task.status}
                            />
                          </span>
                        )}
                        {waiting.length > 0 && (
                          <WaitingOn blockers={waiting} className="min-w-0" />
                        )}
                      </span>
                    </td>

                    <td className="hidden max-w-40 px-3 py-2 text-xs lg:table-cell">
                      <WaitingOn blockers={waiting} className="max-w-full" />
                    </td>

                    <td className="hidden px-3 py-2 sm:table-cell">
                      {task.priority ? (
                        <PriorityTag priority={task.priority} />
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>

                    <td className="hidden px-3 py-2 text-xs sm:table-cell">
                      {task.dueDate ? (
                        <DueDate
                          dueDate={task.dueDate}
                          today={today}
                          status={task.status}
                        />
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>

                    <td className="hidden px-3 py-2 lg:table-cell">
                      <Assignee assigneeId={task.assigneeId} />
                    </td>

                    <td
                      className="px-2 py-2 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setAddAfterId(task.id)}
                        aria-label={`Add a task after ${task.title}`}
                        title="Add a task after this one"
                        className="rounded-md p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-accent"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {addAfter && (
        <AddNextTaskDialog
          source={addAfter}
          nodes={nodes}
          edges={edges}
          onClose={() => setAddAfterId(null)}
        />
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

function EmptyState({ hasTasks }: { hasTasks: boolean }) {
  return (
    <p className="px-5 py-16 text-center text-sm text-text-faint">
      {hasTasks
        ? "No tasks match this filter."
        : "This story has no tasks yet. Add one on the graph."}
    </p>
  );
}
