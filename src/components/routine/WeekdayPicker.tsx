"use client";

import { WEEKDAYS } from "@/lib/date/calendar";
import {
  EVERY_DAY,
  WEEKDAY_DAYS,
  WEEKEND_DAYS,
  WEEK_ORDER,
  hasWeekday,
  toggleWeekday,
} from "@/domain/routine/schedule";

const PRESETS: { label: string; mask: number }[] = [
  { label: "Every day", mask: EVERY_DAY },
  { label: "Weekdays", mask: WEEKDAY_DAYS },
  { label: "Weekends", mask: WEEKEND_DAYS },
];

/**
 * Seven toggles and three shortcuts.
 *
 * The shortcuts are not a separate mode — they set the same seven
 * toggles, which stay visible and stay editable, so "weekdays but not
 * Wednesday" is one more tap rather than a different kind of schedule
 * the form does not have.
 *
 * The last day on cannot be turned off (see toggleWeekday). Rather
 * than refusing the press silently, that day is disabled once it is
 * the only one left, so the control looks the way it behaves.
 */
export function WeekdayPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (mask: number) => void;
  disabled?: boolean;
}) {
  const daysOn = WEEK_ORDER.filter((day) => hasWeekday(value, day));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5" role="group" aria-label="Days">
        {WEEK_ORDER.map((day) => {
          const on = hasWeekday(value, day);
          const last = on && daysOn.length === 1;
          return (
            <button
              key={day}
              type="button"
              disabled={disabled || last}
              aria-pressed={on}
              title={last ? "A routine needs at least one day" : undefined}
              onClick={() => onChange(toggleWeekday(value, day))}
              className={`h-8 flex-1 rounded-md border text-xs font-medium transition-colors disabled:cursor-default ${
                on
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              {WEEKDAYS[day]}
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset.mask)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              value === preset.mask
                ? "border-accent text-accent"
                : "border-border text-text-faint hover:border-border-strong hover:text-text"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
