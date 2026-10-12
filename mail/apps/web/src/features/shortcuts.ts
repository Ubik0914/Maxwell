"use client";
import { useEffect, useRef } from "react";

export type ShortcutMap = Partial<Record<string, () => void>>;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Gmail に近いキーボード操作（入力中は無効） */
export function useShortcuts(map: ShortcutMap, enabled: boolean) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.shiftKey && e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const fn = ref.current[key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
