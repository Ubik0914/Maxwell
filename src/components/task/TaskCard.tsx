"use client";

import type { GraphNode } from "@/domain/graph/types";
import { GripIcon } from "@/components/icons";
import { DueDate, PriorityTag, WaitingOn } from "@/components/task/TaskFields";

/**
 * A task on the board.
 *
 * Two hit areas with two jobs: the body opens the task, the handle picks
 * it up. Keeping them separate is what lets a card be tapped on a phone
 * without the column scrolling turning into an accidental drag.
 *
 * The handle is also the keyboard path — left and right arrows move the
 * card between columns. Drag-and-drop is unreachable without a pointer,
 * so a board whose only way to change state is dragging would be a board
 * some people simply cannot use.
 */
export function TaskCard({
  task,
  blockers,
  today,
  isLifted,
  isFlying,
  flashClass,
  onOpen,
  onGrab,
  onNudge,
}: {
  task: GraphNode;
  blockers: GraphNode[];
  today: string;
  isLifted?: boolean;
  isFlying?: boolean;
  flashClass?: string;
  onOpen?: () => void;
  onGrab?: (event: React.PointerEvent) => void;
  onNudge?: (direction: -1 | 1) => void;
}) {
  return (
    <div
      data-card
      className={`flex items-start gap-1 rounded-lg border border-border bg-surface p-2.5 transition-colors ${
        isLifted ? "board-card-lifted" : ""
      } ${isFlying ? "board-card-held" : ""} ${flashClass ?? ""}`}
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          // A card is mostly a title, so the title is the button rather
          // than a link-shaped thing next to one.
          className="block w-full text-left text-sm leading-snug text-text"
        >
          {task.title}
        </button>

        {(task.priority || task.dueDate || blockers.length > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {task.priority && <PriorityTag priority={task.priority} />}
            {task.dueDate && (
              <DueDate
                dueDate={task.dueDate}
                today={today}
                status={task.status}
              />
            )}
            {blockers.length > 0 && (
              <WaitingOn blockers={blockers} className="max-w-full" />
            )}
          </div>
        )}
      </div>

      {onGrab && (
        <button
          type="button"
          onPointerDown={onGrab}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              onNudge?.(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              onNudge?.(1);
            }
          }}
          aria-label={`Move ${task.title}`}
          title="Drag to move, or use the arrow keys"
          // touch-none is the whole reason this is a handle: it takes the
          // browser's scroll gesture away here and only here, so the
          // column still scrolls everywhere else on the card.
          className="-mr-1 shrink-0 cursor-grab touch-none rounded p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-text active:cursor-grabbing"
        >
          <GripIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
