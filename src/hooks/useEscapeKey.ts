"use client";

import { useEffect } from "react";

/**
 * Closes a modal/panel on Escape, independent of where focus is —
 * keyboard and pointer should have equal ways out. Pass `enabled: false`
 * (or omit calling it) when the surface isn't open, so the closed state
 * never leaves a stray global listener behind.
 *
 * `exclusive` is for a window opened from another surface that is also
 * listening: it catches the key on the way down and stops it, so one
 * press dismisses one thing. Without it, opening a story's settings
 * from the drawer and pressing Escape puts both away — the drawer has
 * no way to know a dialog is over it, and listeners on the way up run
 * in the order they were added, which is the order things mounted, so
 * the surface underneath answers first.
 */
export function useEscapeKey(
  onEscape: () => void,
  enabled: boolean,
  { exclusive = false }: { exclusive?: boolean } = {},
) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (exclusive) event.stopPropagation();
      onEscape();
    }

    window.addEventListener("keydown", handleKeyDown, exclusive);
    return () =>
      window.removeEventListener("keydown", handleKeyDown, exclusive);
  }, [enabled, onEscape, exclusive]);
}
