"use client";

import { useSyncExternalStore } from "react";
import {
  applyMotionPreference,
  readMotionPreference,
  subscribeToMotionPreference,
  type MotionPreference,
} from "@/lib/motion";

const OPTIONS: { value: MotionPreference; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Follow the device setting" },
  { value: "full", label: "Full", hint: "Sparks, flow and rim light" },
  { value: "reduced", label: "Reduced", hint: "Light only, nothing travels" },
];

/**
 * Where someone can disagree with their device about this one app.
 *
 * The graph says what it means with moving light — sparks running a
 * live edge, a rim light on work in progress — and a device-wide
 * "reduce motion" is right to switch that off by default. But it is a
 * blunt instrument: plenty of people keep it on for the OS and would
 * still want the one canvas whose whole language is flow to flow. This
 * makes that a choice rather than an ultimatum.
 *
 * localStorage is an external store, so it's read through the hook
 * built for that rather than copied into state by an effect: the server
 * renders "system", the client corrects it on hydration, and a change
 * made in another tab arrives here too. The page itself never waits for
 * any of this — an inline script in the head has already applied the
 * preference before the first paint.
 */
export function MotionToggle() {
  const preference = useSyncExternalStore(
    subscribeToMotionPreference,
    readMotionPreference,
    () => "system" as const,
  );

  function choose(next: MotionPreference) {
    applyMotionPreference(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Motion"
      className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-bg p-1"
    >
      {OPTIONS.map((option) => {
        const isActive = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={option.hint}
            onClick={() => choose(option.value)}
            className={`rounded-md px-2 py-1.5 text-xs transition-colors ${
              isActive
                ? "bg-accent-soft text-accent"
                : "text-text-muted hover:bg-surface-hover hover:text-text"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
