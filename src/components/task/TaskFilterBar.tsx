"use client";

import { useEffect, useRef } from "react";
import type { TaskStatus } from "@/domain/graph/types";
import type { StatusFilter } from "@/features/tasks/filter";
import { BOARD_STATUSES, STATUS_INK, STATUS_LABEL } from "@/components/task/status";
import { SearchIcon } from "@/components/icons";

export type { StatusFilter } from "@/features/tasks/filter";

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
  /*
   * Keep the chosen chip on screen.
   *
   * The row scrolls sideways, so a filter reached by swiping the list
   * can easily be one of the chips currently off the edge — and then
   * nothing visible says which filter is applied. `inline: nearest`
   * moves it the shortest distance that makes it visible, and
   * `block: nearest` is what stops the page itself from scrolling on
   * the way.
   */
  const activeChip = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeChip.current?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: "smooth",
    });
  }, [status]);

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

      {/* One line that runs off the side, not two that fold. Six pills
          wrapping cost the list a whole row of height for controls you
          glance at once. `-mx-3` + matching padding lets the row bleed
          to the screen edge, so a chip scrolled to the end sits flush
          rather than in a gutter. */}
      <div
        role="group"
        aria-label="Filter by status"
        className="scroll-x -mx-3 flex w-full min-w-0 items-center gap-1 px-3 sm:mx-0 sm:w-auto sm:flex-1 sm:px-0"
      >
        <FilterChip
          ref={status === null ? activeChip : undefined}
          isActive={status === null}
          onClick={() => onStatusChange(null)}
          label="All"
          count={total}
        />
        {BOARD_STATUSES.map((value) => (
          <FilterChip
            key={value}
            ref={status === value ? activeChip : undefined}
            isActive={status === value}
            onClick={() => onStatusChange(status === value ? null : value)}
            label={STATUS_LABEL[value]}
            count={counts[value]}
            ink={STATUS_INK[value]}
          />
        ))}

        {/* Inside the scroller, not after it. Anything the caller adds
            here is another pill that changes what the list shows, and
            parking it outside would put it on a second line on a phone
            — the exact thing the scroller exists to avoid. */}
        {children && (
          <>
            <span
              aria-hidden="true"
              className="mx-1 h-4 w-px shrink-0 bg-border"
            />
            {children}
          </>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  ref,
  isActive,
  onClick,
  label,
  count,
  ink = "text-text-muted",
}: {
  ref?: React.Ref<HTMLButtonElement>;
  isActive: boolean;
  onClick: () => void;
  label: string;
  count: number;
  ink?: string;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      // An empty state is still worth showing — "0 blocked" is
      // information — but it shouldn't compete with the states that have
      // something in them.
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${
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
