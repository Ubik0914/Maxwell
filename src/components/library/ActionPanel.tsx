"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Kbd } from "@/components/library/Window";
import { foldForSearch } from "@/domain/library/filter";

export interface Action {
  id: string;
  title: string;
  /** Groups actions under a small heading, in the order they appear. */
  section: string;
  icon?: ReactNode;
  keys?: string[];
  danger?: boolean;
  run: () => void;
}

/**
 * Raycast's ⌘K panel: every action for the selected thing, in a list
 * you can filter by typing and walk with the arrow keys.
 *
 * It floats above the footer's right-hand corner, where the button that
 * opens it lives, and takes the keyboard while it is open — arrows move
 * within it, Enter runs, Escape closes — so nothing typed here reaches
 * the list underneath.
 */
export function ActionPanel({
  actions,
  onClose,
}: {
  actions: Action[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const words = query.split(/\s+/).map(foldForSearch).filter(Boolean);
    return actions.filter((action) =>
      words.every((word) => foldForSearch(action.title).includes(word)),
    );
  }, [actions, query]);

  const index = Math.min(active, Math.max(shown.length - 1, 0));

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !panelRef.current?.contains(event.target)
      ) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  function run(action: Action | undefined) {
    if (!action) return;
    onClose();
    action.run();
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="アクション"
      className="absolute right-2 bottom-12 z-30 flex max-h-[min(24rem,70dvh)] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-lg border border-border-strong bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:right-3"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActive((index + 1) % Math.max(shown.length, 1));
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setActive(
            (index - 1 + Math.max(shown.length, 1)) % Math.max(shown.length, 1),
          );
        } else if (event.key === "Enter") {
          event.preventDefault();
          run(shown[index]);
        } else if (
          event.key === "Escape" ||
          (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey))
        ) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <ul role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1">
        {shown.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-text-faint">
            該当するアクションはありません
          </li>
        )}
        {shown.map((action, i) => {
          // A heading wherever the section changes from the row above.
          const heading =
            action.section !== shown[i - 1]?.section ? action.section : null;
          return (
            <li key={action.id}>
              {heading && (
                <p className="px-2 pt-2 pb-1 text-[10px] font-semibold text-text-faint">
                  {heading}
                </p>
              )}
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(action)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                  i === index ? "bg-surface-hover" : ""
                } ${action.danger ? "text-danger" : "text-text"}`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted">
                  {action.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{action.title}</span>
                {action.keys && (
                  <span className="flex shrink-0 gap-0.5">
                    {action.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <input
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        placeholder="アクションを検索…"
        aria-label="アクションを検索"
        className="shrink-0 border-t border-border bg-transparent px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none"
      />
    </div>
  );
}
