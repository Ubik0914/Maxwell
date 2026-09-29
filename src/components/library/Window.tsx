import type { ReactNode } from "react";

/**
 * The library's frame, drawn after Raycast: one floating window with a
 * search bar across the top, the content in the middle, and a thin
 * action bar along the bottom that says what Enter and ⌘K will do.
 *
 * On a desktop it floats in the middle of the page with a rounded edge
 * and a deep shadow; on a phone there is no room to float, so it simply
 * is the page.
 */
export function Window({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh justify-center bg-bg sm:px-6 sm:py-8">
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-surface sm:rounded-xl sm:border sm:border-border sm:shadow-[0_30px_90px_rgba(0,0,0,0.7)]">
        {children}
      </div>
    </div>
  );
}

/** The strip across the top: an input, usually, with things beside it. */
export function WindowBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
      {children}
    </div>
  );
}

/**
 * The strip across the bottom. The left says where you are; the right
 * holds the actions, primary first, each with the key that does it.
 */
export function WindowFooter({
  left,
  children,
}: {
  left: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-bg/40 px-3 py-2 text-xs text-text-muted sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 truncate">
        {left}
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  );
}

/** A key, the way a keyboard shortcut is written on a menu. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-hover px-1 font-sans text-[10px] text-text-muted">
      {children}
    </kbd>
  );
}

/** A button in the footer: a label and, on keyboards, its shortcut. */
export function FooterButton({
  onClick,
  children,
  keys,
  primary = false,
}: {
  onClick: () => void;
  children: ReactNode;
  keys?: string[];
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
        primary
          ? "font-medium text-text hover:bg-surface-hover"
          : "text-text-muted hover:bg-surface-hover hover:text-text"
      }`}
    >
      {children}
      {keys && (
        <span className="hidden items-center gap-0.5 sm:flex">
          {keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </span>
      )}
    </button>
  );
}
