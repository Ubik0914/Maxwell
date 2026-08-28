"use client";

import type { GraphNode } from "@/domain/graph/types";
import { GripIcon, PlusIcon } from "@/components/icons";
import { DueDate, PriorityTag, WaitingOn } from "@/components/task/TaskFields";
import { useLongPress, type PressPoint } from "@/hooks/useLongPress";

function noop() {}

/**
 * A task on the board.
 *
 * The card body is one press — open the task — and it is the card
 * itself that carries it, not a button wrapped around the title. The
 * two controls in the corner do something else (pick the card up, add
 * what comes after it), so those are real buttons, and they stop the
 * press from reaching the card underneath.
 *
 * Keeping the grip separate from the body is what lets a card be tapped
 * on a phone without the column's scroll gesture turning into a drag.
 * The grip is also the keyboard path — left and right arrows move the
 * card between columns — because drag-and-drop is unreachable without a
 * pointer, and a board whose only way to change state is dragging is a
 * board some people simply cannot use.
 *
 * With no handlers (the clone that follows the pointer during a drag)
 * nothing here is interactive, and nothing here claims to be.
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
  onAddNext,
  onLongPress,
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
  onAddNext?: () => void;
  onLongPress?: (point: PressPoint) => void;
}) {
  // Always called — hooks cannot be conditional — but the handlers are
  // only attached to a card that has somewhere to send the gesture.
  const press = useLongPress(onLongPress ?? noop);

  return (
    <div
      // Carries the id so a drop can measure the cards on screen and
      // skip the one being carried — see useCardDrag's locate().
      data-card={task.id}
      {...(onLongPress ? press : {})}
      {...(onOpen
        ? {
            tabIndex: 0,
            "aria-label": `Open ${task.title}`,
            onClick: onOpen,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            },
          }
        : {})}
      className={`longpress flex items-start gap-1 rounded-lg border border-border bg-surface p-2.5 transition-colors focus-visible:border-accent focus-visible:outline-none ${
        onOpen ? "cursor-pointer hover:border-border-strong" : ""
      } ${isLifted ? "board-card-lifted" : ""} ${
        isFlying ? "board-card-held" : ""
      } ${flashClass ?? ""}`}
    >
      <div className="min-w-0 flex-1">
        <span className="block text-sm leading-snug text-text">
          {task.title}
        </span>

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

      {(onAddNext || onGrab) && (
        <div className="-mr-1 flex shrink-0 flex-col items-center">
          {onGrab && (
            <button
              type="button"
              onPointerDown={(event) => {
                // Kept off the card, or a slow deliberate grab would
                // also be a long press and open a menu mid-drag.
                event.stopPropagation();
                onGrab(event);
              }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
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
              // touch-none is the whole reason this is a handle: it
              // takes the browser's scroll gesture away here and only
              // here, so the column still scrolls everywhere else.
              className="cursor-grab touch-none rounded p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-text active:cursor-grabbing"
            >
              <GripIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {onAddNext && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAddNext();
              }}
              aria-label={`Add a task after ${task.title}`}
              title="Add a task after this one"
              className="rounded p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-accent"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
