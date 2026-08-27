"use client";

import { useEffect, useState } from "react";
import type { FlowNode } from "@/components/graph/types";

export type NodePulse = "genesis" | "ready" | "done" | "blocked";

/**
 * How long an energy event stays on the graph after the last one fired.
 * It only has to outlast the longest animation it drives — the ready
 * pulse, which waits out the surge crossing the edge (320ms) before its
 * own 900ms flash. Every animation ends holding its settled frame, so
 * clearing them together a beat later is invisible, and it buys a model
 * with exactly one timer in it.
 */
const QUIET_MS = 1300;

const EMPTY = new Map<string, never>();

type Energy = {
  /** Identity of the nodes array this state was derived from. */
  source: FlowNode[];
  keys: ReadonlyMap<string, string>;
  pulses: ReadonlyMap<string, NodePulse>;
  emitters: ReadonlyMap<string, number>;
  arrivals: ReadonlyMap<string, number>;
  /** Bumped once per transition; also serves as the surge identity. */
  seq: number;
};

/**
 * What the animation layer reacts to. START/GOAL carry no status, so
 * their key is their type — constant, which is exactly right: they never
 * pulse on their own, they only conduct.
 */
function stateKey(node: FlowNode): string {
  return node.data.status ?? node.data.type;
}

function keysOf(nodes: FlowNode[]): Map<string, string> {
  return new Map(nodes.map((node) => [node.id, stateKey(node)]));
}

/**
 * Turns the graph's state into energy events.
 *
 * Nothing here animates on a schedule of its own: every value returned
 * is the trace of a transition that just happened, and it is dropped
 * again once the graph has been quiet for a moment. Rendering reads it
 * and forgets it — which is what keeps the canvas still when nothing is
 * happening.
 *
 *   - `pulses`   the node whose status changed, and how (one-shot glow)
 *   - `emitters` a node that just pushed energy downstream: a task that
 *                turned DONE, or a node that just materialised
 *   - `arrivals` a node that just materialised, so the edges feeding it
 *                light up in the source -> target direction too
 *
 * Values in the surge maps are sequence numbers, not booleans: React
 * Flow keeps an edge mounted across renders, so a repeated surge on the
 * same edge needs a changed key to replay its SMIL animation.
 *
 * The diff runs during render (React's "adjust state when a prop
 * changes" pattern) rather than in an effect, so a status change and
 * the pulse it causes reach the DOM in the same commit — there is no
 * frame where a node is DONE but not yet lit.
 */
export function useEnergyFlow(nodes: FlowNode[]): {
  pulses: ReadonlyMap<string, NodePulse>;
  emitters: ReadonlyMap<string, number>;
  arrivals: ReadonlyMap<string, number>;
} {
  // Seeded from the first graph it sees: opening a story should show a
  // settled circuit, not fire every node at once.
  const [energy, setEnergy] = useState<Energy>(() => ({
    source: nodes,
    keys: keysOf(nodes),
    pulses: EMPTY,
    emitters: EMPTY,
    arrivals: EMPTY,
    seq: 0,
  }));

  if (energy.source !== nodes) {
    setEnergy(advance(energy, nodes));
  }

  // One timer for the whole system, restarted by each new transition, so
  // a burst of changes settles together. It keys off `seq` rather than
  // off the maps or `energy`, because a node being dragged replaces
  // `energy` many times a second while firing nothing.
  const { seq } = energy;
  useEffect(() => {
    if (seq === 0) return;
    const timer = setTimeout(() => setEnergy(quiesce), QUIET_MS);
    return () => clearTimeout(timer);
  }, [seq]);

  return {
    pulses: energy.pulses,
    emitters: energy.emitters,
    arrivals: energy.arrivals,
  };
}

/**
 * Diffs the incoming graph against the last one and records what fired.
 * Maps that gained nothing are passed through by reference, so a graph
 * that merely moved (dragging a node) produces no new identities and
 * wakes nothing downstream.
 */
function advance(previous: Energy, nodes: FlowNode[]): Energy {
  const keys = keysOf(nodes);
  const pulses: [string, NodePulse][] = [];
  const emitters: [string, number][] = [];
  const arrivals: [string, number][] = [];
  let seq = previous.seq;

  for (const [id, key] of keys) {
    const before = previous.keys.get(id);
    if (before === key) continue;

    seq += 1;

    if (before === undefined) {
      pulses.push([id, "genesis"]);
      emitters.push([id, seq]);
      arrivals.push([id, seq]);
      continue;
    }
    if (key === "READY") {
      pulses.push([id, "ready"]);
    } else if (key === "BLOCKED") {
      pulses.push([id, "blocked"]);
    } else if (key === "DONE") {
      pulses.push([id, "done"]);
      emitters.push([id, seq]);
    }
  }

  return {
    source: nodes,
    keys,
    pulses: merge(previous.pulses, pulses),
    emitters: merge(previous.emitters, emitters),
    arrivals: merge(previous.arrivals, arrivals),
    seq,
  };
}

function merge<T>(
  entries: ReadonlyMap<string, T>,
  fired: [string, T][],
): ReadonlyMap<string, T> {
  return fired.length === 0 ? entries : new Map([...entries, ...fired]);
}

/** Back to rest: every animation driven from here has already settled. */
function quiesce(previous: Energy): Energy {
  if (
    previous.pulses.size === 0 &&
    previous.emitters.size === 0 &&
    previous.arrivals.size === 0
  ) {
    return previous;
  }
  return {
    ...previous,
    pulses: EMPTY,
    emitters: EMPTY,
    arrivals: EMPTY,
  };
}
