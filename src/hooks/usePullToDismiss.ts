"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Far enough that it was meant: px, or this share of the sheet. */
const DISMISS_PX = 120;
const DISMISS_SHARE = 0.25;
/** A quick flick counts even when it did not travel far: px per ms. */
const FLING_SPEED = 0.6;
/** Movement before a pull is decided to be a pull, not a tap. */
const SLOP_PX = 6;
const SETTLE = "translate 260ms cubic-bezier(0.16, 0.9, 0.28, 1)";

/**
 * iOS's sheet gesture: at the top of a sheet's content, pull down and
 * the whole sheet comes with your finger; let go far enough (or flick)
 * and it slides away and closes, otherwise it springs back.
 *
 * Unlike useSheetDismiss, which listens on a grab handle only, the pull
 * can start anywhere on the sheet — the handle, the header, the content
 * — as long as the content is scrolled to its top. Pulling down from
 * further in is just scrolling up, as it is in iOS.
 *
 * Phones only (below `sm`), where these screens are sheets. It moves
 * the sheet with the `translate` property rather than `transform`: the
 * sheets' entrance animations end on `transform: none` with a fill, and
 * an animation outranks an inline style — `translate` composes with it
 * instead of fighting it. It writes to the DOM directly while the
 * finger moves rather than through React state, so the sheet keeps up
 * with the finger instead of with a render.
 *
 * The touchmove listener is registered non-passive, because a pull has
 * to stop the page's own scroll-bounce from taking the same gesture.
 */
export function usePullToDismiss({
  sheetRef,
  scrollRef,
  backdropRef,
  onDismiss,
  enabled = true,
}: {
  /** What moves. */
  sheetRef: RefObject<HTMLElement | null>;
  /** The content that scrolls; a pull only starts when it is at the top. */
  scrollRef?: RefObject<HTMLElement | null>;
  /** Dimmed less as the sheet is pulled away, if there is one. */
  backdropRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  enabled?: boolean;
}) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!enabled || !sheet) return;

    let startY = 0;
    let startedAt = 0;
    let tracking = false;
    let pulling = false;
    let distance = 0;

    const phone = () => !window.matchMedia("(min-width: 640px)").matches;
    const atTop = () => (scrollRef?.current?.scrollTop ?? 0) <= 0;

    function place(offset: number, transition: string) {
      if (!sheet) return;
      sheet.style.transition = transition;
      sheet.style.translate = offset > 0 ? `0 ${offset}px` : "";
      const backdrop = backdropRef?.current;
      if (backdrop) {
        const share = Math.min(offset / sheet.offsetHeight, 1);
        backdrop.style.transition = transition.replace("translate", "opacity");
        backdrop.style.opacity = offset > 0 ? String(1 - share) : "";
      }
    }

    function onStart(event: TouchEvent) {
      if (event.touches.length !== 1 || !phone()) return;
      // A touch that starts inside the scrolling content only counts if
      // the content is already at its top; one on the header always
      // does, since the header does not scroll.
      const inScroll = scrollRef?.current?.contains(event.target as Node);
      tracking = !inScroll || atTop();
      pulling = false;
      distance = 0;
      startY = event.touches[0].clientY;
      startedAt = performance.now();
    }

    function onMove(event: TouchEvent) {
      if (!tracking) return;
      const dy = event.touches[0].clientY - startY;
      if (!pulling) {
        if (dy < -SLOP_PX) {
          // Going up: that is a scroll, and it is not ours.
          tracking = false;
          return;
        }
        if (dy < SLOP_PX || !atTop()) return;
        pulling = true;
      }
      event.preventDefault();
      distance = Math.max(0, dy);
      place(distance, "none");
    }

    function onEnd() {
      if (!pulling) {
        tracking = false;
        return;
      }
      tracking = false;
      pulling = false;
      const elapsed = performance.now() - startedAt;
      const flung = elapsed > 0 && distance / elapsed > FLING_SPEED;
      const far =
        distance > Math.min(DISMISS_PX, sheet!.offsetHeight * DISMISS_SHARE);
      if (far || (flung && distance > 30)) {
        // Off the bottom of the screen, then gone.
        place(sheet!.offsetHeight + 40, SETTLE);
        window.setTimeout(() => dismissRef.current(), 220);
      } else {
        place(0, SETTLE);
      }
    }

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, sheetRef, scrollRef, backdropRef]);
}
