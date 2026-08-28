"use client";

import { useRef, useState, type TouchEvent } from "react";

/** Where the panel has to reach before a release counts as "open". */
const SETTLE_RATIO = 0.5;
/** Fallback width for the first gesture, before the panel is measured. */
const ASSUMED_WIDTH = 288;

export type DrawerDragState = { x: number; progress: number } | null;

/**
 * The drawer's drag gesture, kept apart from what the drawer contains.
 *
 * A drag can start from either side of the interaction: the grab strip
 * along the screen edge opens, the panel itself closes, and both run
 * the same arithmetic from a different origin. While a drag is live the
 * caller positions the panel from `drag.x` and fades the backdrop by
 * `drag.progress`; when it ends the panel settles to whichever side it
 * was nearer.
 *
 * Touch events keep firing on the element the gesture began on, so the
 * handlers go on that element rather than the document — no listener to
 * add and tear down mid-gesture. Callers must set `touch-action`
 * themselves: React attaches touch listeners passively, so
 * `preventDefault` would be ignored and only the declarative form
 * actually stops the page scrolling underneath.
 */
export function useDrawerDrag({
  onSettle,
}: {
  onSettle: (open: boolean) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const origin = useRef<{ startX: number; from: number } | null>(null);
  const [drag, setDrag] = useState<DrawerDragState>(null);

  function width() {
    return panelRef.current?.offsetWidth || ASSUMED_WIDTH;
  }

  function begin(event: TouchEvent, from: "edge" | "panel") {
    const touch = event.touches[0];
    if (!touch) return;
    const start = from === "edge" ? -width() : 0;
    origin.current = { startX: touch.clientX, from: start };
    setDrag({ x: start, progress: from === "edge" ? 0 : 1 });
  }

  function move(event: TouchEvent) {
    const active = origin.current;
    const touch = event.touches[0];
    if (!active || !touch) return;

    const span = width();
    const x = Math.min(
      0,
      Math.max(-span, active.from + touch.clientX - active.startX),
    );
    setDrag({ x, progress: 1 + x / span });
  }

  function end() {
    if (!origin.current) return;
    const settled = (drag?.progress ?? 0) > SETTLE_RATIO;
    origin.current = null;
    setDrag(null);
    onSettle(settled);
  }

  /** Spread onto whichever element should start this kind of drag. */
  function handlers(from: "edge" | "panel") {
    return {
      onTouchStart: (event: TouchEvent) => begin(event, from),
      onTouchMove: move,
      onTouchEnd: end,
      onTouchCancel: end,
    };
  }

  return { panelRef, drag, handlers };
}
