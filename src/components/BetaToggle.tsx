"use client";

import { useId } from "react";
import { BETA_FEATURES, setBeta } from "@/lib/beta";
import { useBeta } from "@/hooks/useBeta";

/**
 * The switch for things that are not finished yet.
 *
 * A switch rather than the three-way control Motion uses, because this
 * is one question with two answers — and it names what it turns on
 * underneath, because "Beta: off" tells nobody whether they are missing
 * anything they wanted.
 *
 * The list dims rather than disappearing when the switch is off. What
 * is available is the reason to reach for the switch at all, and a
 * setting that hides its own subject can only be understood by someone
 * who has already turned it on once.
 */
export function BetaToggle() {
  const isOn = useBeta();
  const labelId = useId();

  return (
    <div className="mx-1.5 flex flex-col gap-2 rounded-lg border border-border bg-bg p-2">
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="text-xs text-text">
          Unfinished features
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-labelledby={labelId}
          onClick={() => setBeta(!isOn)}
          // No transition, deliberately. The server cannot know what
          // this browser stored, so it renders the switch off and the
          // client corrects it — and with a transition on, that
          // correction is a visible slide: every page load, the switch
          // appears to turn itself on. A settings toggle that snaps
          // costs a press 150ms of polish; one that animates itself on
          // arrival looks like it is doing something.
          className={`relative h-5 w-9 shrink-0 rounded-full ${
            isOn ? "bg-accent" : "bg-border-strong"
          }`}
        >
          <span
            aria-hidden="true"
            // Light, not the panel colour. A dark knob on the accent
            // track reads as a hole punched in it rather than as a
            // thing that slid, and a hole does not invite a press.
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-text ${
              isOn ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>

      <ul className={`flex flex-col gap-1 ${isOn ? "" : "opacity-50"}`}>
        {BETA_FEATURES.map((feature) => (
          <li key={feature.key} className="text-[11px] leading-snug">
            <span className="text-text-muted">{feature.name}</span>
            <span className="text-text-faint"> — {feature.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
