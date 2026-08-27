"use client";

import { useEffect } from "react";

/**
 * Closes a modal/panel on Escape, independent of where focus is —
 * keyboard and pointer should have equal ways out. Pass `enabled: false`
 * (or omit calling it) when the surface isn't open, so the closed state
 * never leaves a stray global listener behind.
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onEscape();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onEscape]);
}
