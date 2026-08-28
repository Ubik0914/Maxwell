"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DragState {
  taskId: string;
  /** Where the flying card should be drawn, in viewport coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The `data-drop-zone` value under the pointer, or null. */
  over: string | null;
}

/**
 * Dragging a card from one column to another.
 *
 * Pointer events rather than HTML5 drag-and-drop, which has no usable
 * touch story at all — on a phone the native API simply never fires, and
 * a board you can only use with a mouse is not a board. Pointer events
 * are one code path for mouse, touch and pen.
 *
 * The drop target is resolved with elementFromPoint on each move rather
 * than by dragover handlers on the columns, because the card being
 * carried sits under the pointer the whole time. It is drawn with
 * `pointer-events: none` (see .board-card-flying) precisely so this
 * lookup sees the column underneath it.
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
  onDrop: (taskId: string, zone: string) => void;
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

  // A gesture still in flight when the board unmounts would otherwise
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
        over: zoneAt(event.clientX, event.clientY),
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
          over: zoneAt(moveEvent.clientX, moveEvent.clientY),
        });
      };

      const finish = (upEvent: PointerEvent) => {
        const current = dragRef.current;
        detach();
        update(null);
        if (!current) return;
        const zone = zoneAt(upEvent.clientX, upEvent.clientY);
        if (zone) onDrop(current.taskId, zone);
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

function zoneAt(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y);
  return (
    element?.closest<HTMLElement>("[data-drop-zone]")?.dataset.dropZone ?? null
  );
}
