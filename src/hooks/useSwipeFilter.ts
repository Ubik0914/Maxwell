"use client";

import { useCallback, useEffect, useRef } from "react";

/** Far enough to be a swipe rather than a slip of the thumb. */
const DISTANCE_PX = 64;
/**
 * How much more horizontal than vertical the movement has to be. A
 * gesture that is mostly up-and-down is someone scrolling the list, and
 * stealing it would make the list feel like it snags.
 */
const DIRECTION_RATIO = 1.6;

/**
 * Places a swipe must not start, because the thing under the finger
 * already means something by being dragged or scrolled sideways.
 */
const EXEMPT = "select, input, textarea, .scroll-x, [data-no-swipe]";

/**
 * Swipe left or right to move to the next or previous filter.
 *
 * The chips at the top of a list are a row of siblings, and on a phone
 * a row of siblings is something you expect to be able to swipe
 * between — reaching up to a 2mm chip to see the next slice of a list
 * is the kind of thing that makes a web app feel like a web app.
 *
 * Touch and pen only. A mouse has a pointer that can reach the chips
 * without effort, and a click-drag across a list is a text selection,
 * not a gesture.
 *
 * The click the browser sends after the finger lifts is swallowed once
 * a swipe has fired, so a swipe that happens to start on a row does not
 * also open it.
 */
export function useSwipeFilter({
  onSwipe,
  enabled = true,
}: {
  /** -1 for a swipe right (go back), +1 for a swipe left (go on). */
  onSwipe: (direction: -1 | 1) => void;
  enabled?: boolean;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const didFire = useRef(false);

  useEffect(() => {
    if (!enabled) origin.current = null;
  }, [enabled]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled || event.pointerType === "mouse") return;
      if ((event.target as HTMLElement).closest(EXEMPT)) return;
      origin.current = { x: event.clientX, y: event.clientY };
      didFire.current = false;
    },
    [enabled],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const start = origin.current;
      origin.current = null;
      if (!start) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < DISTANCE_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;

      didFire.current = true;
      onSwipe(dx < 0 ? 1 : -1);
    },
    [onSwipe],
  );

  const cancel = useCallback(() => {
    origin.current = null;
  }, []);

  return {
    /*
     * `pan-y` is what makes the rest of this work at all.
     *
     * Left to itself the browser owns the gesture: as soon as a touch
     * moves on a scrollable box it decides this is a scroll, takes it,
     * and sends `pointercancel` — so the swipe was never seen. Saying
     * "vertical panning is yours, nothing else is" leaves horizontal
     * movement here and stops the cancel, while the list still scrolls
     * up and down natively.
     */
    style: { touchAction: "pan-y" as const },
    onPointerDown,
    onPointerUp,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // Capture, so it runs before whatever the swipe passed over decides
    // it has been clicked.
    onClickCapture: useCallback((event: React.MouseEvent) => {
      if (!didFire.current) return;
      didFire.current = false;
      event.preventDefault();
      event.stopPropagation();
    }, []),
  };
}
