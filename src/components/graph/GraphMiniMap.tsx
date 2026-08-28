"use client";

import { MiniMap } from "@xyflow/react";
import type { FlowNode } from "@/components/graph/types";

/**
 * Reads a token off the document rather than hardcoding a hex, so the
 * minimap can never be the one place the palette was forgotten. It is
 * called per node per render by React Flow, so the values are resolved
 * once per paint and cached.
 */
function token(name: string, cache: Map<string, string>): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  cache.set(name, value);
  return value;
}

const colours = new Map<string, string>();

/**
 * A node's colour in the overview, which is the same colour it has on
 * the canvas.
 *
 * That is the whole point of colouring it at all: shrunk to a few
 * pixels a node has no title and no shape left, so if the minimap were
 * a uniform grey it would only answer "where am I". Keeping the state
 * palette makes it answer "how far has this got" as well — a wall of
 * green behind you, red ahead — which on a graph too big for one screen
 * is the question you opened it to ask.
 */
function nodeColour(node: FlowNode): string {
  if (node.data.type === "START") return token("--accent", colours);
  if (node.data.type === "GOAL") {
    return node.data.reached
      ? token("--success", colours)
      : token("--border-strong", colours);
  }

  switch (node.data.status) {
    case "DONE":
      return token("--success", colours);
    case "IN_PROGRESS":
      return token("--warning", colours);
    case "READY":
      return token("--accent", colours);
    case "BLOCKED":
      return token("--danger", colours);
    default:
      // CANCELLED, and anything without a status: present, spent.
      return token("--dead", colours);
  }
}

/**
 * The whole graph, small, in the corner.
 *
 * Bottom-right because the toolbar has the bottom-left, and because a
 * graph laid out by dependency runs left to right — the far end is the
 * part you cannot see, and the overview of it belongs on that side.
 *
 * Pannable and zoomable: an overview you can only look at is half a
 * control. Dragging inside it moves the canvas, which on a phone is the
 * fastest way across a wide story.
 */
export function GraphMiniMap() {
  return (
    <MiniMap<FlowNode>
      pannable
      zoomable
      ariaLabel="Graph overview"
      nodeColor={nodeColour}
      nodeStrokeWidth={0}
      nodeBorderRadius={3}
      // The unseen part of the canvas is dimmed rather than tinted, so
      // the bright patch is exactly where you are looking.
      maskColor="rgba(6, 9, 15, 0.72)"
      maskStrokeColor="var(--accent)"
      maskStrokeWidth={3}
      className="graph-minimap"
    />
  );
}
