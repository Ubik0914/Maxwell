"use client";

import { useEffect, type RefObject } from "react";

/**
 * Closes a surface when the next press lands outside it.
 *
 * `pointerdown` on the document rather than a transparent backdrop
 * element: a backdrop swallows the press it intercepts, so dismissing
 * the panel and clicking the thing you actually wanted would take two
 * presses. Here the press reaches its target as well, which is what
 * lets clicking a second task on the graph close this panel and select
 * that task in one go.
 *
 * Pass `enabled: false` while a dialog is layered on top: a click
 * inside a portalled modal is outside this element by DOM position but
 * plainly not "outside" to the person doing it.
 */
export function useOutsideClick(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      // A click on something that has already been removed from the
      // document (an option in a native picker, a row that just
      // re-rendered) can't be located, and guessing "outside" would
      // close the panel out from under the user.
      if (!target.isConnected) return;
      if (ref.current?.contains(target)) return;
      onOutside();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown);
  }, [ref, onOutside, enabled]);
}
