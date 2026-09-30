"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";
import { Kbd } from "@/components/library/Window";
import { useBackToClose } from "@/hooks/useBackToClose";
import { usePullToDismiss } from "@/hooks/usePullToDismiss";
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
 * On a desktop it floats above the footer's right-hand corner, where
 * the button that opens it lives, and takes the keyboard while it is
 * open — arrows move within it, Enter runs, Escape closes — so nothing
 * typed here reaches the list underneath.
 *
 * On a phone a popover that small is a target you miss, so it is a page
 * instead: the whole screen, a header with a close button, the search
 * at the top, and the keyboard left down until you ask for it.
 */
export function ActionPanel({
  actions,
  onClose,
  title = "アクション",
}: {
  actions: Action[];
  onClose: () => void;
  /** The phone sheet's heading, for a panel of one kind of action. */
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  // On a phone it is a sheet, and pulled down it closes.
  usePullToDismiss({
    sheetRef: panelRef,
    scrollRef: listRef,
    backdropRef,
    onDismiss: onClose,
  });
  // Back closes the panel, as it would any page. Running an action goes
  // through `dismiss` so the panel's history entry is gone before the
  // action starts — one that navigates would otherwise be undone by the
  // back step that follows it.
  const dismiss = useBackToClose(true, onClose);

  // Type-to-filter is the point on a keyboard; on a phone, focusing the
  // field would throw the on-screen keyboard over the list you opened
  // this to tap.
  useEffect(() => {
    if (window.matchMedia("(min-width: 640px)").matches) {
      inputRef.current?.focus();
    }
  }, []);

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
    dismiss(action.run);
    onClose();
  }

  return (
    <>
      {/* Phones only: the sheet dims what it covers. A press here is
        outside the panel, so the document listener above closes it. */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="modal-backdrop fixed inset-0 z-[70] bg-black/60 sm:hidden"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        className="lib-pop fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] bottom-0 z-[70] flex flex-col overflow-hidden rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(0,0,0,0.5)] sm:absolute sm:top-auto sm:inset-auto sm:right-3 sm:bottom-12 sm:z-30 sm:max-h-[min(24rem,70dvh)] sm:w-[22rem] sm:rounded-lg sm:border sm:border-border-strong sm:p-0 sm:shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index + 1) % Math.max(shown.length, 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(
              (index - 1 + Math.max(shown.length, 1)) %
                Math.max(shown.length, 1),
            );
          } else if (event.key === "Enter") {
            event.preventDefault();
            run(shown[index]);
          } else if (
            event.key === "Escape" ||
            (event.key.toLowerCase() === "k" &&
              (event.metaKey || event.ctrlKey))
          ) {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border-strong sm:hidden"
        />
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 pt-1 pb-2 sm:hidden">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <ul
          ref={listRef}
          role="listbox"
          className="order-2 min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:order-none sm:p-1"
        >
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
                  <p className="px-3 pt-3 pb-1 text-xs font-semibold text-text-faint sm:px-2 sm:pt-2 sm:text-[10px]">
                    {heading}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(action)}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-base sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-sm ${
                    i === index ? "bg-surface-hover" : ""
                  } ${action.danger ? "text-danger" : "text-text"}`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted">
                    {action.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {action.title}
                  </span>
                  {action.keys && (
                    <span className="hidden shrink-0 gap-0.5 sm:flex">
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
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          placeholder={`${title}を検索…`}
          aria-label={`${title}を検索`}
          className="order-1 m-3 shrink-0 rounded-md border border-border bg-bg px-3 py-2.5 text-base text-text placeholder:text-text-faint focus:border-accent focus:outline-none sm:order-none sm:m-0 sm:rounded-none sm:border-0 sm:border-t sm:bg-transparent sm:py-2 sm:text-sm"
        />
      </div>
    </>
  );
}
