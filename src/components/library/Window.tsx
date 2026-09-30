import type { ReactNode, Ref } from "react";

/**
 * The library's frame, drawn after Raycast: one floating window with a
 * search bar across the top, the content in the middle, and a thin
 * action bar along the bottom that says what Enter and ⌘K will do.
 *
 * On a desktop it floats in the middle of the page with a rounded edge
 * and a deep shadow; on a phone there is no room to float, so it simply
 * is the page.
 */
export function Window({
  children,
  sheet = false,
  wide = false,
  settled = false,
  sheetRef,
}: {
  children: ReactNode;
  /**
   * From `md` up, fill the screen edge to edge instead of floating —
   * for a layout with a sidebar, which wants the whole width.
   */
  wide?: boolean;
  /**
   * Already on screen — a loading shell showed this sheet first — so
   * it appears in place rather than sliding up again.
   */
  settled?: boolean;
  /**
   * On a phone, present it as a sheet over black — inset from the top,
   * rounded, with a grabber — for a screen that is pulled down to leave
   * (see usePullToDismiss). No difference from `sm` up.
   */
  sheet?: boolean;
  sheetRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      // theme-raycast switches the whole document to the library's
      // palette while this is on the page (see styles/library.css).
      className={`theme-raycast lib-desktop flex h-dvh justify-center sm:bg-bg sm:px-6 sm:py-8 ${wide ? "md:p-0" : ""} ${
        sheet ? "bg-black pt-[calc(env(safe-area-inset-top)+0.75rem)]" : "bg-bg"
      }`}
    >
      <div
        ref={sheetRef}
        className={`lib-window flex h-full w-full max-w-5xl flex-col overflow-hidden bg-surface sm:rounded-xl sm:border sm:border-border sm:shadow-[0_30px_90px_rgba(0,0,0,0.7)] ${
          sheet ? `rounded-t-2xl ${settled ? "lib-settled" : "modal-page"}` : ""
        } ${
          wide
            ? "lib-wide md:max-w-none md:rounded-none md:border-0 md:shadow-none"
            : ""
        }`}
      >
        {sheet && (
          <div
            aria-hidden="true"
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border-strong sm:hidden"
          />
        )}
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
    // On a phone the footer is where the thumb is, so it is sized for
    // one: taller, larger text, and padded clear of the home indicator.
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-bg/40 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-sm text-text-muted sm:px-4 sm:py-2 sm:text-xs">
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
    // Raycast's key caps: a lighter tile, no outline.
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-white/10 px-1 font-sans text-[11px] leading-none text-text-muted">
      {children}
    </kbd>
  );
}

const TONE = {
  primary:
    "bg-accent text-inverse hover:bg-accent-hover shadow-[0_6px_20px_var(--accent-soft)]",
  ghost: "text-text-muted hover:bg-surface-hover hover:text-text",
  outline:
    "border border-border text-text-muted hover:bg-surface-hover hover:text-text",
  danger: "text-danger hover:bg-danger-soft",
} as const;

/**
 * A button that is a picture. The library's buttons are icons first:
 * the shape says what it does, and the words live in `label` — read
 * out by a screen reader and shown as a tooltip on hover — rather than
 * printed on every button in the window.
 *
 * Thumb-sized (44px) on a phone, the compact 32px Raycast size from
 * `sm` up. `keys` is the keyboard shortcut, shown with the label in a
 * small card when the button is hovered or focused from the keyboard.
 */
export function IconButton({
  label,
  onClick,
  children,
  tone = "ghost",
  keys,
  type = "button",
  disabled = false,
  className = "",
  hintAlign = "right",
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  tone?: keyof typeof TONE;
  keys?: string[];
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  /** Which edge the shortcut card lines up with: the one away from the
   *  screen edge the button is near. */
  hintAlign?: "left" | "right";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-keyshortcuts={keys ? keys.join("+").replace("⌘", "Meta") : undefined}
      // A button with a shortcut says so in its own hover card below;
      // the browser's tooltip would say it a second time.
      title={keys ? undefined : label}
      className={`group relative flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl transition-[transform,background-color,color] active:scale-[0.92] disabled:opacity-50 sm:h-8 sm:min-w-8 sm:rounded-lg ${TONE[tone]} ${className}`}
    >
      {children}
      {keys && (
        // The shortcut, shown only on hover or keyboard focus — a hint
        // for whoever is at a keyboard, not a label on every button.
        // Pointer devices only: a phone has no hover and no ⌘.
        <span
          role="tooltip"
          className={`pointer-events-none absolute top-full ${hintAlign === "left" ? "left-0" : "right-0"} z-40 mt-1.5 hidden items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2 py-1 text-xs whitespace-nowrap text-text-muted opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:hover)]:flex`}
        >
          {label}
          <span className="flex items-center gap-0.5">
            {keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </span>
        </span>
      )}
    </button>
  );
}
