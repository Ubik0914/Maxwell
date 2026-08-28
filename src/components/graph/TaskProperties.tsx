"use client";

import type { ReactNode } from "react";
import type { TaskStatus } from "@/domain/graph/types";

const PRIORITY_LABEL: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  BLOCKED: "Blocked",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  BLOCKED: "text-text-faint border-border",
  READY: "text-accent border-accent/40 bg-accent-soft",
  IN_PROGRESS: "text-warning border-warning/40 bg-warning-soft",
  DONE: "text-success border-success/40 bg-success-soft",
  CANCELLED: "text-text-faint border-border",
};

const SET = "border-border text-text";
const UNSET = "border-border text-text-muted";

/** Strips a control back to text so the chip's border is the only frame. */
const BARE =
  "cursor-pointer appearance-none bg-transparent text-xs text-current focus:outline-none";

/**
 * A property as a chip: the value is the label.
 *
 * Each one wraps a real form control styled to disappear into the pill,
 * so the whole surface stays keyboard- and screen-reader-native and a
 * phone still gets its own OS picker on tap — no custom popover to
 * reimplement badly.
 */
function Chip({
  tone = UNSET,
  dot,
  children,
}: {
  tone?: string;
  dot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-within:border-accent ${tone}`}
    >
      {dot}
      {children}
    </div>
  );
}

/**
 * The row of chips between a task's title and its description —
 * everything about the task that isn't prose, compressed into one line
 * that wraps.
 *
 * It owns no state: each control reports upward and the panel decides
 * what to save and when, because status goes through the Status Engine
 * while the rest are plain field updates.
 */
export function TaskProperties({
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  dueDate,
  onDueDateChange,
  assigneeId,
  onAssigneeChange,
  onAssigneeCommit,
}: {
  status: TaskStatus;
  onStatusChange: (status: "READY" | "IN_PROGRESS" | "DONE" | "CANCELLED") => void;
  priority: number;
  onPriorityChange: (priority: number) => void;
  dueDate: string;
  onDueDateChange: (dueDate: string) => void;
  assigneeId: string;
  onAssigneeChange: (assigneeId: string) => void;
  onAssigneeCommit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip
        tone={STATUS_TONE[status]}
        dot={
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
          />
        }
      >
        <label htmlFor="panel-status" className="sr-only">
          Status
        </label>
        <select
          id="panel-status"
          value={status}
          onChange={(e) =>
            onStatusChange(
              e.target.value as "READY" | "IN_PROGRESS" | "DONE" | "CANCELLED",
            )
          }
          className={BARE}
        >
          {/* Only reachable by the engine, never by choosing it. */}
          {status === "BLOCKED" && (
            <option value="BLOCKED" disabled>
              {STATUS_LABEL.BLOCKED}
            </option>
          )}
          <option value="READY">{STATUS_LABEL.READY}</option>
          <option value="IN_PROGRESS">{STATUS_LABEL.IN_PROGRESS}</option>
          <option value="DONE">{STATUS_LABEL.DONE}</option>
          <option value="CANCELLED">{STATUS_LABEL.CANCELLED}</option>
        </select>
      </Chip>

      <Chip tone={priority ? SET : UNSET}>
        <label htmlFor="panel-priority" className="sr-only">
          Priority
        </label>
        <select
          id="panel-priority"
          value={priority}
          onChange={(e) => onPriorityChange(Number(e.target.value))}
          className={BARE}
        >
          <option value={0}>Priority</option>
          {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Chip>

      <Chip tone={dueDate ? SET : UNSET}>
        <label htmlFor="panel-due-date" className="sr-only">
          Due date
        </label>
        {/* An empty date input renders the browser's own "mm/dd/yyyy",
            which shouts about a value that isn't set. When there's no
            date the input is laid transparently over the chip instead,
            so the chip reads as a name like the others and still opens
            the picker anywhere on it. */}
        {!dueDate && <span aria-hidden="true">Due date</span>}
        <input
          id="panel-due-date"
          type="date"
          value={dueDate}
          onChange={(e) => onDueDateChange(e.target.value)}
          className={
            dueDate
              ? `${BARE} w-[7.5rem]`
              : `${BARE} absolute inset-0 h-full w-full opacity-0`
          }
        />
      </Chip>

      <Chip tone={assigneeId ? SET : UNSET}>
        <label htmlFor="panel-assignee" className="sr-only">
          Assignee
        </label>
        <input
          id="panel-assignee"
          value={assigneeId}
          onChange={(e) => onAssigneeChange(e.target.value)}
          onBlur={onAssigneeCommit}
          placeholder="Assignee"
          className={`${BARE} w-24 cursor-text placeholder:text-text-muted`}
        />
      </Chip>
    </div>
  );
}
