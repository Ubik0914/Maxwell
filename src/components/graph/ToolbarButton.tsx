import type { ReactNode } from "react";

/**
 * An icon-only control on the graph canvas, named for assistive tech by
 * `aria-label` and for everyone else by the native tooltip. Both carry
 * the same string, so there is one name to keep true.
 *
 * It lives apart from GraphToolbar because CreateTaskDialog renders one
 * too, and having the dialog import from the toolbar that renders it
 * would close a module cycle.
 */
export function ToolbarButton({
  label,
  onClick,
  tone = "muted",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "muted" | "accent";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
        tone === "accent"
          ? "text-accent hover:bg-accent-soft"
          : "text-text-muted hover:bg-surface-hover hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}
