import type { ReactNode } from "react";

/** A property that has a value set, and one that doesn't. */
export const CHIP_SET = "border-border text-text";
export const CHIP_UNSET = "border-border text-text-muted";

/**
 * A property as a pill: the value is the label.
 *
 * The shell only — what it wraps is either a real form control styled
 * to disappear into it, or, in a chain of them, a value already
 * decided. Same pill either way, so a row of them reads as one row
 * rather than a control with decoration beside it.
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
