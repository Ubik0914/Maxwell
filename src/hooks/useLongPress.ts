"use client";

import { useCallback, useEffect, useRef } from "react";

export interface PressPoint {
  x: number;
  y: number;
}

/** Long enough not to fire while scrolling, short enough to feel deliberate. */
const HOLD_MS = 450;
/** Past this the press was a scroll or a drag, not a hold. */
const SLOP_PX = 10;

/**
 * "Press and hold for more" — plus right-click, which is the same
 * request made with a mouse.
 *
 * Two paths on purpose. A mouse gets `contextmenu`, because that is
 * what a right-click already means and hijacking it with a timer would
 * make a normal click feel sticky. Touch and pen get a timer, because
 * the native long-press varies by platform and on iOS raises the
 * system text callout instead of firing anything we can hear.
 *
 * The hold is cancelled by movement, so a flick that starts on a card
 * scrolls the list rather than opening a menu over it. And the click
 * that the browser sends after the finger lifts is swallowed once the
 * menu has opened — otherwise every long press would also do whatever
 * a tap does.
 */
export function useLongPress(onLongPress: (point: PressPoint) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<PressPoint | null>(null);
  const didFire = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const point = { x: event.clientX, y: event.clientY };
      origin.current = point;
      didFire.current = false;
      timer.current = setTimeout(() => {
        didFire.current = true;
        cancel();
        onLongPress(point);
      }, HOLD_MS);
    },
    [cancel, onLongPress],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const start = origin.current;
      if (!start) return;
      if (
        Math.abs(event.clientX - start.x) > SLOP_PX ||
        Math.abs(event.clientY - start.y) > SLOP_PX
      ) {
        cancel();
      }
    },
    [cancel],
  );

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      // A right-click never becomes a click, so nothing to swallow.
      cancel();
      onLongPress({ x: event.clientX, y: event.clientY });
    },
    [cancel, onLongPress],
  );

  const onClick = useCallback((event: React.MouseEvent) => {
    if (!didFire.current) return;
    didFire.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu,
    // Capture, so it runs before the element's own onClick rather than
    // after it — by the time a bubbling handler saw it, the tap would
    // already have opened whatever it opens.
    onClickCapture: onClick,
  };
}
