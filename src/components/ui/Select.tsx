"use client";

import type { ReactNode } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { Chip, CHIP_CONTROL, CHIP_UNSET } from "@/components/ui/Chip";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /**
   * Shown but not choosable — for a value the system can put a record
   * into but a person may not (a BLOCKED task), which still has to
   * appear or the control would display something that isn't in its
   * own list.
   */
  disabled?: boolean;
}

/**
 * Every dropdown in the app.
 *
 * A real `<select>` under the styling, always. It keeps the control
 * keyboard- and screen-reader-native, and it means a phone gets its own
 * OS picker on tap — a custom popover would have to reimplement type-
 * ahead, arrow keys, edge-of-screen flipping and touch scrolling, and
 * would do all four worse.
 *
 * What this adds over a bare `<select>` is the two things that were
 * being written out by hand at each of the four call sites: an
 * accessible name that is always present (visible in a form, sr-only in
 * a chip), and a chevron. The native arrow disappears with
 * `appearance-none` the moment you style the control at all, and a
 * dropdown with no mark on it does not read as a dropdown — which is
 * the whole reason to draw our own.
 *
 * Two shapes, because there are two places dropdowns appear:
 *
 *   chip    inline among a task's properties, where the value *is* the
 *           label and the pill is the only frame
 *   field   in a form, with its label above it and room for a hint
 */
export function Select<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  variant = "field",
  tone,
  leading,
  hint,
  disabled = false,
  className = "",
}: {
  id: string;
  /** Always required: sr-only in a chip, visible above a field. */
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  variant?: "chip" | "field";
  /** chip only: the colour the pill takes from its value. */
  tone?: string;
  /** chip only: something before the value, e.g. a status dot. */
  leading?: ReactNode;
  /** field only: a line under the control explaining the consequence. */
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const control = (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
      className={
        variant === "chip"
          ? `${CHIP_CONTROL} disabled:cursor-default`
          : "w-full cursor-pointer appearance-none rounded-md border border-border bg-bg py-2 pr-9 pl-3 text-sm text-text transition-colors focus:border-accent focus:outline-none disabled:cursor-default disabled:opacity-50"
      }
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );

  if (variant === "chip") {
    return (
      <Chip tone={tone ?? CHIP_UNSET} className={className}>
        {leading}
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        {control}
        <ChevronDownIcon className="-mr-0.5 h-3 w-3 opacity-60" />
      </Chip>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      <div className="relative">
        {control}
        {/* pointer-events-none so the chevron is decoration over the
            control, not a dead spot in the middle of its hit area. */}
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-text-faint" />
      </div>
      {hint && <p className="text-xs text-text-faint">{hint}</p>}
    </div>
  );
}
