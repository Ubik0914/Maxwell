"use client";

import type { Priority, TaskStatus } from "@/domain/graph/types";
import { PRIORITY_LABEL, type SettableStatus } from "@/components/task/status";
import { StatusSelect } from "@/components/task/StatusSelect";
import { Chip, CHIP_CONTROL, CHIP_SET, CHIP_UNSET } from "@/components/ui/Chip";
import { Select, type SelectOption } from "@/components/ui/Select";
import { DateField } from "@/components/ui/DateField";

/** "" is the absence of a priority, which a list of choices can only
 *  carry as a choice of its own — `null` is what actually gets saved. */
type PriorityValue = "" | `${Priority}`;

const PRIORITY_OPTIONS: SelectOption<PriorityValue>[] = [
  { value: "", label: "Priority" },
  ...(Object.entries(PRIORITY_LABEL) as [`${Priority}`, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
];

/**
 * The row of chips between a task's title and its description —
 * everything about the task that isn't prose, compressed into one line
 * that wraps.
 *
 * It owns no state: each control reports upward and the panel decides
 * what to save and when, because status goes through the Status Engine
 * while the rest are plain field updates.
 *
 * Neither dropdown here is spelled out any more — Status is
 * StatusSelect and Priority is the shared Select, both in the chip
 * shape the two remaining `<input>` chips use. Which statuses are
 * choosable, and what a dropdown looks like, are each decided in one
 * place now rather than at whichever call sites happen to show them.
 */
export function TaskProperties({
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  dueDate,
  onDueDateChange,
  today,
  assigneeId,
  onAssigneeChange,
  onAssigneeCommit,
}: {
  status: TaskStatus;
  onStatusChange: (status: SettableStatus) => void;
  priority: number;
  onPriorityChange: (priority: number) => void;
  dueDate: string;
  onDueDateChange: (dueDate: string) => void;
  /** Today, as an ISO date — the calendar must not read the clock. */
  today: string;
  assigneeId: string;
  onAssigneeChange: (assigneeId: string) => void;
  onAssigneeCommit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusSelect id="panel-status" status={status} onChange={onStatusChange} />

      <Select
        id="panel-priority"
        label="Priority"
        variant="chip"
        value={(priority ? String(priority) : "") as PriorityValue}
        options={PRIORITY_OPTIONS}
        onChange={(value) => onPriorityChange(Number(value))}
        tone={priority ? CHIP_SET : CHIP_UNSET}
      />

      <DateField
        id="panel-due-date"
        label="Due date"
        value={dueDate}
        onChange={onDueDateChange}
        today={today}
      />

      <Chip tone={assigneeId ? CHIP_SET : CHIP_UNSET}>
        <label htmlFor="panel-assignee" className="sr-only">
          Assignee
        </label>
        <input
          id="panel-assignee"
          value={assigneeId}
          onChange={(e) => onAssigneeChange(e.target.value)}
          onBlur={onAssigneeCommit}
          placeholder="Assignee"
          className={`${CHIP_CONTROL} w-24 cursor-text placeholder:text-text-muted`}
        />
      </Chip>
    </div>
  );
}
