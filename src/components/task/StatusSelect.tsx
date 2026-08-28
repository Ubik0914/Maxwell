"use client";

import { useMemo } from "react";
import type { TaskStatus } from "@/domain/graph/types";
import { canRequestStatus } from "@/domain/graph/status-change";
import {
  SETTABLE_STATUSES,
  STATUS_LABEL,
  STATUS_TONE,
  type SettableStatus,
} from "@/components/task/status";
import { Select, type SelectOption } from "@/components/ui/Select";

/**
 * The one control that changes a task's state, wherever it appears.
 *
 * All it is now is the Select with the product's rule about status
 * attached: which values are choosable, what colour each one makes the
 * pill, and the dot. The pill, the chevron, the accessible name and the
 * native `<select>` underneath are the shared component's.
 *
 * BLOCKED appears only when the task is already in it, and then only as
 * a disabled option: it is the Status Engine's to assign, never a
 * choice. From there, Cancel is the one move left — abandoning work you
 * are blocked on is a decision about the task, while Ready, In progress
 * and Done are all claims about a graph that says otherwise. The engine
 * refuses those anyway (validateStatusChange); showing them enabled
 * would just be offering three ways to be told no.
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
  const options = useMemo<SelectOption<TaskStatus>[]>(() => {
    const settable = SETTABLE_STATUSES.map((value) => ({
      value,
      label: STATUS_LABEL[value],
    }));
    if (status !== "BLOCKED") return settable;
    return [
      { value: "BLOCKED" as const, label: STATUS_LABEL.BLOCKED, disabled: true },
      ...settable.map((option) => ({
        ...option,
        disabled: !canRequestStatus(status, option.value),
      })),
    ];
  }, [status]);

  return (
    <Select
      id={id}
      label="Status"
      variant="chip"
      value={status}
      options={options}
      onChange={(next) => onChange(next as SettableStatus)}
      tone={STATUS_TONE[status]}
      disabled={disabled}
      className={className}
      leading={
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
        />
      }
    />
  );
}
