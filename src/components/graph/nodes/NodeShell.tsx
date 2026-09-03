import type { ReactNode } from "react";
import type { TaskStatus } from "@/domain/graph/types";
import type { NodePulse } from "@/features/graph/hooks/useEnergyFlow";

const PULSE_CLASS: Record<NodePulse, string> = {
  genesis: "pulse-genesis",
  ready: "pulse-ready",
  done: "pulse-done",
  blocked: "pulse-blocked",
};

/**
 * The physical body every node shares: a compact, opaque card meant to
 * read as an object sitting on the canvas rather than as a row in a
 * table.
 *
 * The title inside is one line, cut at the card's edge. The card is
 * 170px because that is a readable size for something you scan a
 * canvas full of, not because titles are 170px long — so on hover it
 * takes the width the title needs and gives it back on the way out
 * (see .node-shell). Where there is no pointer the line stays cut.
 *
 * The card is also what carries the light. Its box-shadow is owned by
 * exactly one animation at a time — a running pulse *replaces* the
 * ambient loop instead of stacking with it, because two `animation`
 * declarations on one element resolve by stylesheet order rather than
 * by which class was applied last. Hover deliberately uses transform
 * and filter only, so it can never fight whichever glow is running.
 */
export function NodeShell({
  pulse,
  border,
  ambient,
  orbit = false,
  children,
}: {
  pulse?: NodePulse;
  border: string;
  ambient: string;
  orbit?: boolean;
  children: ReactNode;
}) {
  const motion = pulse ? PULSE_CLASS[pulse] : ambient;

  return (
    <div className="node-shell relative w-[170px] transition-transform duration-150 ease-out hover:scale-[1.02] hover:drop-shadow-[0_4px_14px_rgba(0,0,0,0.55)]">
      {orbit && !pulse && <div className="node-orbit" aria-hidden="true" />}
      <div
        className={`relative rounded-[10px] border bg-surface px-3 py-2 ${border} ${motion}`}
      >
        {children}
      </div>
    </div>
  );
}

/** The status glyph: a lit point for live states, a dead one otherwise. */
export function StatusDot({ status }: { status: TaskStatus }) {
  const lit = status === "READY" || status === "IN_PROGRESS" || status === "DONE";

  return (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${
        lit ? "shadow-[0_0_6px_currentColor]" : "opacity-60"
      }`}
    />
  );
}
