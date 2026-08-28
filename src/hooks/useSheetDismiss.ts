"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Far enough that it was meant, close enough that it isn't a haul. */
const DISMISS_PX = 110;
/** A short flick counts even when it didn't travel: px per ms. */
const FLING_SPEED = 0.6;

/**
 * Pull a sheet down to dismiss it.
 *
 * Only where the panel actually is a sheet. On a wide screen the same
 * component is a column beside the graph, and dragging that downward
 * would look like the page had come loose — so the gesture is checked
 * against the same breakpoint the layout uses and simply doesn't start
 * above it.
 *
 * The panel follows the finger exactly while the gesture is live and is
 * only animated on release, which is what makes it feel attached rather
 * than remote-controlled. Downward only: a sheet that can be flung
 * upward past its own top edge is a sheet that looks broken.
 */
export function useSheetDismiss(onDismiss: () => void) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startedAt = useRef(0);
  const detach = useRef<(() => void) | null>(null);

  useEffect(() => () => detach.current?.(), []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      if (window.matchMedia("(min-width: 640px)").matches) return;

      startY.current = event.clientY;
      startedAt.current = performance.now();
      setIsDragging(true);

      const move = (moveEvent: PointerEvent) => {
        setOffset(Math.max(0, moveEvent.clientY - startY.current));
      };

      const end = (upEvent: PointerEvent) => {
        detach.current?.();
        detach.current = null;
        setIsDragging(false);

        const travelled = Math.max(0, upEvent.clientY - startY.current);
        const elapsed = performance.now() - startedAt.current;
        const flung = elapsed > 0 && travelled / elapsed > FLING_SPEED;

        if (travelled > DISMISS_PX || (flung && travelled > 24)) {
          onDismiss();
          return;
        }
        setOffset(0);
      };

      const cancel = () => {
        detach.current?.();
        detach.current = null;
        setIsDragging(false);
        setOffset(0);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", cancel);
      detach.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", cancel);
      };
    },
    [onDismiss],
  );

  return {
    /** Spread onto the grab area. */
    handleProps: { onPointerDown, className: "touch-none" },
    /** Spread onto the sheet itself. */
    sheetStyle: {
      translate: offset ? `0 ${offset}px` : undefined,
      transition: isDragging
        ? "none"
        : "translate 220ms cubic-bezier(0.16, 0.9, 0.28, 1)",
    },
  };
}
