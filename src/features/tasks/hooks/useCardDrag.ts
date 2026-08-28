"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DropTarget {
  /** The `data-drop-zone` value under the pointer. */
  zone: string;
  /** Where in that zone the card would land, counting without itself. */
  index: number;
}

export interface DragState {
  taskId: string;
  /** Where the flying card should be drawn, in viewport coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  over: DropTarget | null;
}

/**
 * Dragging a card — between zones, and to a place within one.
 *
 * Pointer events rather than HTML5 drag-and-drop, which has no usable
 * touch story at all — on a phone the native API simply never fires,
 * and a board you can only use with a mouse is not a board. Pointer
 * events are one code path for mouse, touch and pen.
 *
 * The target is resolved with elementFromPoint on each move rather than
 * by dragover handlers on the zones, because the card being carried
 * sits under the pointer the whole time. It is drawn with
 * `pointer-events: none` (see .board-card-flying) precisely so this
 * lookup sees what is underneath it.
 *
 * The insertion index is measured from the cards actually on screen
 * rather than tracked in state: the pointer is either above or below
 * each card's midpoint, and that is the entire rule. The card being
 * dragged is skipped, so "put it back where it was" reports the index
 * it already had rather than one past it.
 *
 * The grab has to start on a handle, not on the card: a card that moves
 * when you touch it anywhere cannot be tapped to open, and a column that
 * scrolls under your thumb is worth more than a slightly larger grab
 * area. The handle sets `touch-action: none`; the rest of the card keeps
 * the browser's own scrolling.
 */
export function useCardDrag({
  onDrop,
}: {
  onDrop: (taskId: string, target: DropTarget) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Read by the window listeners, which are attached once per gesture
  // and must not close over a stale drag.
  const dragRef = useRef<DragState | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const detachRef = useRef<(() => void) | null>(null);

  const update = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const detach = useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
  }, []);

  // A gesture still in flight when the view unmounts would otherwise
  // leave its listeners on the window forever.
  useEffect(() => detach, [detach]);

  const start = useCallback(
    (event: React.PointerEvent, taskId: string) => {
      // Secondary buttons open context menus; they are not a grab.
      if (event.button !== 0) return;

      const card = (event.currentTarget as HTMLElement).closest<HTMLElement>(
        "[data-card]",
      );
      if (!card) return;

      const rect = card.getBoundingClientRect();
      offsetRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      event.preventDefault();
      update({
        taskId,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        over: locate(event.clientX, event.clientY, taskId),
      });

      // Listened for on the window, not on the card: a fast drag outruns
      // the pointer, and the gesture must not end just because the
      // cursor left the element it started on.
      const handleMove = (moveEvent: PointerEvent) => {
        const current = dragRef.current;
        if (!current) return;
        update({
          ...current,
          x: moveEvent.clientX - offsetRef.current.x,
          y: moveEvent.clientY - offsetRef.current.y,
          over: locate(moveEvent.clientX, moveEvent.clientY, taskId),
        });
      };

      const finish = (upEvent: PointerEvent) => {
        detach();
        update(null);
        const target = locate(upEvent.clientX, upEvent.clientY, taskId);
        if (target) onDrop(taskId, target);
      };

      // A cancelled pointer (the OS took over, the tab lost focus) puts
      // the card back rather than dropping it wherever it happened to be.
      const cancel = () => {
        detach();
        update(null);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", cancel);
      detachRef.current = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
      };
    },
    // `onDrop` is captured when the grab starts, which is exactly the
    // behaviour wanted: the listeners live for one gesture, so they
    // should act on the callback as it was when that gesture began.
    [detach, update, onDrop],
  );

  return { drag, start };
}

function locate(x: number, y: number, movingId: string): DropTarget | null {
  const zone = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-drop-zone]");
  if (!zone?.dataset.dropZone) return null;

  const cards = [...zone.querySelectorAll<HTMLElement>("[data-card]")].filter(
    (card) => card.dataset.card !== movingId,
  );

  let index = cards.length;
  for (let i = 0; i < cards.length; i += 1) {
    const rect = cards[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      index = i;
      break;
    }
  }

  return { zone: zone.dataset.dropZone, index };
}
