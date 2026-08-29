"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PressPoint } from "@/hooks/useLongPress";
import { useEscapeKey } from "@/hooks/useEscapeKey";

const MARGIN = 8;

export interface MenuItemSpec {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Draws it as the destructive one, and puts a rule above it. */
  danger?: boolean;
  /** Starts a new group: a rule above this item. */
  separated?: boolean;
  /** Currently true of this task — a status it is already in. */
  checked?: boolean;
  disabled?: boolean;
}

/**
 * The menu a long press (or a right-click) opens, at the point it was
 * pressed.
 *
 * Anchored to the press rather than to the element, because the element
 * is a whole row: a menu pinned to its corner would open a thumb's
 * width from where the thumb actually is. It portals to document.body
 * for the reason every overlay in this app does — the graph canvas and
 * its viewport carry transforms, and a transformed ancestor becomes the
 * containing block for `position: fixed`, which would resolve this
 * against the panned canvas instead of the window.
 *
 * It closes on Escape, on a press outside it, and on scroll: a menu
 * anchored to a point on screen is wrong the moment the thing under
 * that point moves, and following the scroll would be pretending it
 * belongs to the row.
 */
export function Menu({
  at,
  items,
  onClose,
}: {
  at: PressPoint;
  items: MenuItemSpec[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Placed after the first paint, once there is a box to measure. Until
  // then it is drawn at the press point and hidden, so a menu that will
  // be flipped never appears in the wrong corner first.
  const [box, setBox] = useState<{ width: number; height: number } | null>(
    null,
  );

  // Exclusive: a menu is the innermost thing on screen, and the
  // surface it was opened from — a drawer, a panel — is listening for
  // Escape too. One press should put away one thing.
  useEscapeKey(onClose, true, { exclusive: true });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setBox({ width: rect.width, height: rect.height });
  }, [items.length]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
      onClose();
    }
    // Capture, so a press outside closes the menu without also
    // activating whatever it landed on.
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  // Flipped rather than clamped when it would overflow: a menu shoved
  // back inside the window covers the thing it is about, while one
  // opening upward or leftward still points at it.
  const left = box
    ? Math.max(
        MARGIN,
        at.x + box.width + MARGIN > window.innerWidth
          ? at.x - box.width
          : at.x,
      )
    : at.x;
  const top = box
    ? Math.max(
        MARGIN,
        at.y + box.height + MARGIN > window.innerHeight
          ? at.y - box.height
          : at.y,
      )
    : at.y;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left, top, visibility: box ? "visible" : "hidden" }}
      className="menu-panel fixed z-[60] min-w-44 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
    >
      {items.map((item, index) => (
        <div key={item.key}>
          {(item.danger || item.separated) && index > 0 && (
            <hr className="my-1 border-border" aria-hidden="true" />
          )}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            autoFocus={index === 0}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-40 ${
              item.danger
                ? "text-danger hover:bg-danger-soft"
                : "text-text hover:bg-surface-hover"
            }`}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-faint">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.checked && (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]"
              />
            )}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
