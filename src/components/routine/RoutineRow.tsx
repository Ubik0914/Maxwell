"use client";

import { useState } from "react";
import { Menu } from "@/components/ui/Menu";
import { MoreIcon, TrashIcon } from "@/components/icons";
import type { PressPoint } from "@/hooks/useLongPress";
import { scheduleLabel } from "@/domain/routine/schedule";
import type { RoutineListItem } from "@/repositories/routine.repository";

/**
 * The row of marks: the last few days it was due on, oldest first.
 *
 * Filled for done, hollow for missed. Days it was never due on are not
 * drawn at all — a Monday-only routine that "missed" six days a week
 * would read as a failure it never was.
 */
function History({ days }: { days: RoutineListItem["history"] }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {days.map((day) => (
        <span
          key={day.date}
          title={day.date}
          className={`h-1.5 w-1.5 rounded-full ${
            day.done ? "bg-success" : "bg-border-strong"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * The tick box, which is the whole point of the screen.
 *
 * Big enough to hit with a thumb without aiming, and it carries the
 * routine's name as its accessible label rather than sitting beside a
 * separate one: two controls for one decision is one too many.
 *
 * On a day the routine is not due it is not rendered at all. A
 * disabled box would invite the press it is going to refuse; the row
 * simply has nothing to tick.
 */
function Tick({
  routine,
  onToggle,
}: {
  routine: RoutineListItem;
  onToggle: (done: boolean) => void;
}) {
  if (!routine.dueToday) {
    return (
      <span
        aria-hidden="true"
        className="h-6 w-6 shrink-0 rounded-md border border-dashed border-border"
      />
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={routine.doneToday}
      aria-label={routine.title}
      onClick={() => onToggle(!routine.doneToday)}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
        routine.doneToday
          ? "border-success bg-success text-inverse"
          : "border-border-strong text-transparent hover:border-accent"
      }`}
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-3.5 w-3.5"
      >
        <path d="M4.5 10.5l3.5 3.5 7.5-8" />
      </svg>
    </button>
  );
}

export function RoutineRow({
  routine,
  onToggle,
  onEdit,
  onSetActive,
  onDelete,
}: {
  routine: RoutineListItem;
  onToggle: (done: boolean) => void;
  onEdit: () => void;
  onSetActive: (active: boolean) => void;
  onDelete: () => void;
}) {
  const [menuAt, setMenuAt] = useState<PressPoint | null>(null);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-opacity ${
        routine.active ? "" : "opacity-55"
      }`}
    >
      <Tick routine={routine} onToggle={onToggle} />

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${
            routine.doneToday ? "text-text-muted line-through" : "text-text"
          }`}
        >
          {routine.title}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-text-faint">
          <span className="truncate">{scheduleLabel(routine.weekdays)}</span>
          {!routine.active && <span>· Paused</span>}
          {routine.streak > 0 && (
            <span className="shrink-0 tabular-nums">
              · {routine.streak} in a row
            </span>
          )}
        </p>
      </div>

      <History days={routine.history} />

      <button
        type="button"
        aria-label={`Routine actions for ${routine.title}`}
        onClick={(event) =>
          setMenuAt({ x: event.clientX, y: event.clientY })
        }
        className="-m-1 shrink-0 rounded-full p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
      >
        <MoreIcon />
      </button>

      {menuAt && (
        <Menu
          at={menuAt}
          onClose={() => setMenuAt(null)}
          items={[
            {
              key: "edit",
              label: "Edit routine…",
              onSelect: () => {
                setMenuAt(null);
                onEdit();
              },
            },
            {
              key: "active",
              label: routine.active ? "Pause" : "Resume",
              onSelect: () => {
                setMenuAt(null);
                onSetActive(!routine.active);
              },
            },
            {
              key: "delete",
              label: "Delete",
              icon: <TrashIcon />,
              danger: true,
              separated: true,
              onSelect: () => {
                setMenuAt(null);
                onDelete();
              },
            },
          ]}
        />
      )}
    </div>
  );
}
