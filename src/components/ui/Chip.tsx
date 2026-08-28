import type { ReactNode } from "react";

/** A property that has a value set, and one that doesn't. */
export const CHIP_SET = "border-border text-text";
export const CHIP_UNSET = "border-border text-text-muted";

/**
 * A property as a pill: the value is the label.
 *
 * The shell only — every chip in the app wraps a real form control
 * styled to disappear into it, so the whole surface stays keyboard- and
 * screen-reader-native and a phone still gets its own OS picker on tap,
 * with no custom popover to reimplement badly.
 *
 * It lives here rather than beside the task panel because the status
 * dropdown is the same pill and appears in three places the panel knows
 * nothing about. Two copies of these paddings would drift the first
 * time one of them was nudged.
 */
export function Chip({
  tone = CHIP_UNSET,
  className = "",
  children,
}: {
  tone?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-within:border-accent ${tone} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Strips a control back to text so the chip's border is the only frame.
 * Exported because the chip holding a plain <input> (the assignee)
 * needs exactly the same treatment as the ones holding a dropdown.
 */
export const CHIP_CONTROL =
  "cursor-pointer appearance-none bg-transparent text-xs text-current focus:outline-none";
