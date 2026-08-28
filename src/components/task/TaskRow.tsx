"use client";

import type { GraphNode } from "@/domain/graph/types";
import { statusOf, type SettableStatus } from "@/components/task/status";
import { StatusSelect } from "@/components/task/StatusSelect";
import {
  Assignee,
  DueDate,
  PriorityTag,
  WaitingOn,
} from "@/components/task/TaskFields";
import { PlusIcon } from "@/components/icons";
import { useLongPress, type PressPoint } from "@/hooks/useLongPress";

/**
 * One task in the list.
 *
 * Its own component so it can own its own long press — `useLongPress`
 * is a hook, and a hook cannot be called once per row from inside a
 * map. Splitting the row out is what lets the gesture live where the
 * gesture is.
 *
 * The row is one control: focusable, pressable, named. The two things
 * that do something *else* — the status picker and "add next" — stop
 * the press from reaching it.
 */
export function TaskRow({
  task,
  blockers,
  today,
  isSelected,
  flashClass,
  onOpen,
  onAddNext,
  onStatusChange,
  onLongPress,
}: {
  task: GraphNode;
  blockers: GraphNode[];
  today: string;
  isSelected: boolean;
  flashClass: string;
  onOpen: () => void;
  onAddNext: () => void;
  onStatusChange: (status: SettableStatus) => void;
  onLongPress: (point: PressPoint) => void;
}) {
  const press = useLongPress(onLongPress);
  const status = statusOf(task.status);

  return (
    <tr
      {...press}
      tabIndex={0}
      aria-label={`Open ${task.title}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`longpress cursor-pointer border-b border-border/60 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none ${
        isSelected ? "bg-surface" : ""
      } ${flashClass}`}
    >
      {/* The one editable cell. The press that opens a picker must not
          also open the panel behind it. */}
      <td
        className="px-3 py-2 whitespace-nowrap"
        onClick={(event) => event.stopPropagation()}
      >
        <StatusSelect
          id={`status-${task.id}`}
          status={status}
          onChange={onStatusChange}
        />
      </td>

      <td className="w-full max-w-0 px-3 py-2">
        <span className="block truncate text-text">{task.title}</span>
        {/* What the hidden columns were carrying, folded back in under
            the title rather than lost. Each piece appears only below
            the width its own column returns at, so nothing shows
            twice. */}
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
          {blockers.length > 0 && (
            <WaitingOn blockers={blockers} className="min-w-0" />
          )}
        </span>
      </td>

      <td className="hidden max-w-40 px-3 py-2 text-xs lg:table-cell">
        <WaitingOn blockers={blockers} className="max-w-full" />
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
          <DueDate dueDate={task.dueDate} today={today} status={task.status} />
        ) : (
          <span className="text-text-faint">—</span>
        )}
      </td>

      <td className="hidden px-3 py-2 lg:table-cell">
        <Assignee assigneeId={task.assigneeId} />
      </td>

      <td
        className="px-2 py-2 whitespace-nowrap"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onAddNext}
          aria-label={`Add a task after ${task.title}`}
          title="Add a task after this one"
          className="rounded-md p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-accent"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
