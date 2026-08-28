"use client";

import type { TaskStatus } from "@/domain/graph/types";
import { BOARD_STATUSES, STATUS_INK, STATUS_LABEL } from "@/components/task/status";
import { SearchIcon } from "@/components/icons";

/** `null` is "everything" — the absence of a filter, not a sixth state. */
export type StatusFilter = TaskStatus | null;

/**
 * Search and state filters, shared by the list and the board.
 *
 * The counts are on the chips rather than in a separate summary, so the
 * shape of the story is readable without applying anything: five numbers
 * that say how much is stuck, how much can start, how much is done.
 * That is the same question the graph's header meters answer, asked at
 * the granularity you can act on.
 */
export function TaskFilterBar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  counts,
  total,
  children,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  counts: Record<TaskStatus, number>;
  total: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-5">
      <div className="relative flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 transition-colors focus-within:border-accent sm:max-w-64">
        <SearchIcon className="h-3.5 w-3.5 text-text-faint" />
        <label htmlFor="task-search" className="sr-only">
          Search tasks
        </label>
        <input
          id="task-search"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search tasks"
          className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none"
        />
      </div>

      <div
        role="group"
        aria-label="Filter by status"
        className="flex flex-wrap items-center gap-1"
      >
        <FilterChip
          isActive={status === null}
          onClick={() => onStatusChange(null)}
          label="All"
          count={total}
        />
        {BOARD_STATUSES.map((value) => (
          <FilterChip
            key={value}
            isActive={status === value}
            onClick={() => onStatusChange(status === value ? null : value)}
            label={STATUS_LABEL[value]}
            count={counts[value]}
            ink={STATUS_INK[value]}
          />
        ))}
      </div>

      {children}
    </div>
  );
}

function FilterChip({
  isActive,
  onClick,
  label,
  count,
  ink = "text-text-muted",
}: {
  isActive: boolean;
  onClick: () => void;
  label: string;
  count: number;
  ink?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      // An empty state is still worth showing — "0 blocked" is
      // information — but it shouldn't compete with the states that have
      // something in them.
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        isActive
          ? "border-accent bg-accent-soft text-accent"
          : `border-border hover:border-border-strong ${count > 0 ? ink : "text-text-faint"}`
      }`}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
