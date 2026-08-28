"use client";

import type { TaskStatus } from "@/domain/graph/types";
import {
  SETTABLE_STATUSES,
  STATUS_LABEL,
  STATUS_TONE,
  type SettableStatus,
} from "@/components/task/status";

/**
 * The one control that changes a task's state, wherever it appears.
 *
 * It is a real <select> styled to vanish into a pill, so it stays
 * keyboard- and screen-reader-native and a phone gets its own OS picker
 * on tap — no popover to reimplement badly, and no second implementation
 * to keep in step with this one when the panel, the list and the board
 * all need the same thing.
 *
 * BLOCKED appears only when the task is already in it, and then only as
 * a disabled option: it is the Status Engine's to assign, never a
 * choice. Selecting anything else is still allowed from there, because
 * cancelling blocked work is legitimate — the engine rejects the moves
 * that aren't (BLOCKED -> IN_PROGRESS) and the caller shows why.
 */
export function StatusSelect({
  id,
  status,
  onChange,
  disabled = false,
  className = "",
}: {
  id: string;
  status: TaskStatus;
  onChange: (status: SettableStatus) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      // inline-flex, not flex: in a table cell a block-level chip
      // stretches to the column and stops reading as a pill.
      className={`relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-within:border-accent ${STATUS_TONE[status]} ${className}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
      />
      <label htmlFor={id} className="sr-only">
        Status
      </label>
      <select
        id={id}
        value={status}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as SettableStatus)}
        className="cursor-pointer appearance-none bg-transparent text-xs text-current focus:outline-none disabled:cursor-default"
      >
        {status === "BLOCKED" && (
          <option value="BLOCKED" disabled>
            {STATUS_LABEL.BLOCKED}
          </option>
        )}
        {SETTABLE_STATUSES.map((value) => (
          <option key={value} value={value}>
            {STATUS_LABEL[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
