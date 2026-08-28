"use client";

import { useEffect } from "react";

const MARGIN = 8;
const GAP = 6;

/**
 * Puts a layer against the control it belongs to.
 *
 * Fixed to the viewport, and flipped above the control when there isn't
 * room below — flipped rather than clamped, because a layer shoved back
 * inside the window covers the thing it belongs to, while one opening
 * upward still points at it.
 */
function place(layerEl: HTMLElement, anchorEl: HTMLElement) {
  const a = anchorEl.getBoundingClientRect();

  // Width first: a list at least as wide as its control can be wider
  // than it was before this line, and the clamp below needs the width
  // it will actually have.
  layerEl.style.minWidth = `${a.width}px`;
  const height = layerEl.offsetHeight;
  const width = Math.max(layerEl.offsetWidth, a.width);

  const roomBelow = window.innerHeight - a.bottom - MARGIN;
  const above = roomBelow < height && a.top - MARGIN > roomBelow;

  layerEl.style.left = `${Math.min(
    Math.max(MARGIN, a.left),
    window.innerWidth - width - MARGIN,
  )}px`;
  layerEl.style.top = `${
    above ? Math.max(MARGIN, a.top - height - GAP) : a.bottom + GAP
  }px`;
  layerEl.classList.toggle("select-list-above", above);
}

/**
 * A press inside a layer is not a press outside the surface below it.
 *
 * The layer is portalled to the body, so by DOM position it is outside
 * every panel on screen, and the panels close on a press outside
 * themselves. Put this on the layer and on its backdrop and the press
 * stops there — picking from a task's status list changes the status
 * instead of also putting the task away.
 */
export function stopLayerPress(event: React.PointerEvent) {
  event.stopPropagation();
}

/**
 * Attaches a popover to a control: returns the ref to put on the layer.
 *
 * Where a layer sits is not application state. It is a fact about two
 * boxes that can only be known once both are in the document, so it is
 * measured and written at the moment the layer attaches — a ref
 * callback, which runs in the commit before the browser paints. Nothing
 * re-renders to move it, and it is never on screen in the wrong place
 * first, because there is no first render with a placeholder position
 * to be wrong.
 *
 * The layer closes on scroll rather than following it. A layer anchored
 * to a point on screen is wrong the moment the thing under that point
 * moves, and tracking it would be pretending it is attached to the
 * document instead of to the window.
 */
export function useAnchoredLayer({
  anchor,
  isOpen,
  onDismiss,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  onDismiss: () => void;
}): (node: HTMLElement | null) => void {
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    return () => {
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, [isOpen, onDismiss]);

  /*
   * Escape belongs to the layer, and stops there.
   *
   * The surface underneath is usually listening for it too — a dropdown
   * in the task panel sits over a panel that also closes on Escape —
   * and both would answer, so dismissing a list would put the task away
   * with it. Captured on the way down rather than caught on the way up:
   * the innermost thing on screen is the one that should be dismissed,
   * and the capture phase is the only place to be certain of going
   * first, since listeners on the way up run in the order they were
   * added, which is the order things mounted — the opposite.
   */
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onDismiss();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, onDismiss]);

  return (node: HTMLElement | null) => {
    const anchorEl = anchor.current;
    if (node && anchorEl) place(node, anchorEl);
  };
}
