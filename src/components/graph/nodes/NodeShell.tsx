"use client";

import { useCallback, type ReactNode } from "react";
import type { TaskStatus } from "@/domain/graph/types";
import type { NodePulse } from "@/features/graph/hooks/useEnergyFlow";

const PULSE_CLASS: Record<NodePulse, string> = {
  genesis: "pulse-genesis",
  ready: "pulse-ready",
  done: "pulse-done",
  blocked: "pulse-blocked",
};

/** The resting width, and the most a hovered card may take. */
const RESTING_WIDTH = 170;
const MAX_WIDTH = 384;

/**
 * The physical body every node shares: a compact, opaque card meant to
 * read as an object sitting on the canvas rather than as a row in a
 * table.
 *
 * The title inside is one line, cut at the card's edge. The card is
 * 170px because that is a readable size for something you scan a canvas
 * full of, not because titles are 170px long — so on hover it takes the
 * width the title needs, from the middle outwards, and gives it back on
 * the way out. Where there is no pointer the line stays cut.
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
  title,
  children,
}: {
  pulse?: NodePulse;
  border: string;
  ambient: string;
  orbit?: boolean;
  /**
   * The text on the line that gets cut. Not rendered here — each node
   * type lays its own out — but the width it wants has to be measured,
   * and this is what says when to measure it again.
   */
  title: string;
  children: ReactNode;
}) {
  const motion = pulse ? PULSE_CLASS[pulse] : ambient;

  /**
   * How wide this card would have to be to show its whole title.
   *
   * Written as a custom property the hover rule reads, because CSS
   * cannot animate to `max-content`: a transition needs two lengths to
   * interpolate between and a keyword is not one, so `170px` to
   * `max-content` simply jumps. Measuring it here turns the intrinsic
   * size into a number, and a number animates.
   *
   * A ref callback rather than an effect: this is a measurement taken
   * at commit time, which is exactly when the DOM is real and nothing
   * has painted yet. It re-runs when `title` changes, because React
   * detaches and reattaches a ref whose identity changed — which is
   * what makes a rename re-measure.
   *
   * Three reads and one write, all off the resting layout: the title's
   * full width, the width it is being shown at, and the card's. The
   * difference between the last two is the chrome around the text, and
   * that is the same at any width.
   */
  const measure = useCallback(
    (shell: HTMLDivElement | null) => {
      const line = shell?.querySelector<HTMLElement>("[data-node-title]");
      if (!shell || !line) return;

      const chrome = shell.offsetWidth - line.clientWidth;
      const wanted = line.scrollWidth + chrome;
      shell.style.setProperty(
        "--node-open-width",
        `${Math.min(Math.max(wanted, RESTING_WIDTH), MAX_WIDTH)}px`,
      );
    },
    // `title` is not read in here, and that is the point: it is the
    // thing whose change makes the measurement stale, so it belongs in
    // the list even though the rule cannot see it being used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title],
  );

  return (
    // The slot keeps the node's own 170px whatever the card does, and
    // centres the card in it. React Flow puts every node at a
    // translate(x, y), so a card that simply got wider would grow to
    // the right and slide off the position the layout gave it — and on
    // a graph where x means "when", sliding sideways is the one
    // direction that means something. Centred, the growth is shared and
    // the middle of the card never moves.
    <div className="node-slot flex w-[170px] justify-center">
      <div
        ref={measure}
        className="node-shell relative w-[170px] shrink-0 transition-transform duration-150 ease-out hover:scale-[1.02] hover:drop-shadow-[0_4px_14px_rgba(0,0,0,0.55)]"
      >
        {orbit && !pulse && <div className="node-orbit" aria-hidden="true" />}
        <div
          className={`relative rounded-[10px] border bg-surface px-3 py-2 ${border} ${motion}`}
        >
          {children}
        </div>
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
