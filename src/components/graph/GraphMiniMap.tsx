"use client";

import { useCallback, useMemo, useRef } from "react";
import { useNodes, useReactFlow, useStore, useViewport } from "@xyflow/react";
import type { FlowNode } from "@/components/graph/types";
import { DEFAULT_LAYOUT } from "@/domain/graph/layout";

/** Breathing room around the graph, in graph coordinates. */
const PADDING = 60;

/**
 * A node's colour in the overview, which is the same colour it has on
 * the canvas.
 *
 * That is the whole point of colouring it at all: shrunk to a few
 * pixels a node has no title and no shape left, so a uniform grey map
 * would only answer "where am I". Keeping the state palette makes it
 * answer "how far has this got" as well — a wall of green behind you,
 * red ahead — which on a graph too big for one screen is the question
 * you opened it to ask.
 */
function nodeColour(node: FlowNode): string {
  if (node.data.type === "START") return "var(--accent)";
  if (node.data.type === "GOAL") {
    return node.data.reached ? "var(--success)" : "var(--border-strong)";
  }

  switch (node.data.status) {
    case "DONE":
      return "var(--success)";
    case "IN_PROGRESS":
      return "var(--warning)";
    case "READY":
      return "var(--accent)";
    case "BLOCKED":
      return "var(--danger)";
    default:
      // CANCELLED, and anything without a status: present, spent.
      return "var(--dead)";
  }
}

/**
 * The whole graph, small, in the corner.
 *
 * Drawn here rather than with React Flow's own MiniMap, which frames
 * the union of the nodes *and* the current viewport. That is fine on a
 * desktop, where fitting a graph leaves the two about the same size,
 * and useless on a phone: a wide, short graph fitted to a tall narrow
 * window means the viewport covers several screens' worth of empty
 * canvas above and below, and the nodes — the only thing anyone opens
 * an overview to see — collapse into slivers along one edge. There is
 * no prop to turn that off, so the frame is the nodes and the viewport
 * is drawn inside it, however far past the edges it runs.
 *
 * Bottom-right because the toolbar has the bottom-left, and because a
 * graph laid out by dependency runs left to right — the far end is the
 * part you cannot see, and the overview of it belongs on that side.
 *
 * Pressing or dragging inside it moves the canvas, which on a phone is
 * the fastest way across a wide story: an overview you can only look at
 * is half a control.
 */
export function GraphMiniMap() {
  const nodes = useNodes<FlowNode>();
  const { x, y, zoom } = useViewport();
  const paneWidth = useStore((state) => state.width);
  const paneHeight = useStore((state) => state.height);
  const { setCenter } = useReactFlow();
  const svgRef = useRef<SVGSVGElement>(null);

  // The frame: the nodes and nothing else.
  const frame = useMemo(() => {
    if (nodes.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      const width = node.measured?.width ?? DEFAULT_LAYOUT.nodeWidth;
      const height = node.measured?.height ?? DEFAULT_LAYOUT.nodeHeight;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + width);
      maxY = Math.max(maxY, node.position.y + height);
    }

    return {
      x: minX - PADDING,
      y: minY - PADDING,
      width: maxX - minX + PADDING * 2,
      height: maxY - minY + PADDING * 2,
    };
  }, [nodes]);

  /** What the window is showing, in the same coordinates as the nodes. */
  const view = {
    x: -x / zoom,
    y: -y / zoom,
    width: paneWidth / zoom,
    height: paneHeight / zoom,
  };

  // getScreenCTM does the whole mapping — including the letterboxing
  // preserveAspectRatio introduces — so nothing here has to know how
  // the viewBox was fitted into the box.
  const panTo = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        ctm.inverse(),
      );
      setCenter(point.x, point.y, { zoom });
    },
    [setCenter, zoom],
  );

  if (!frame) return null;

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label="Graph overview"
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        panTo(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 0) return;
        panTo(event);
      }}
      className="graph-minimap"
    >
      {nodes.map((node) => (
        <rect
          key={node.id}
          x={node.position.x}
          y={node.position.y}
          width={node.measured?.width ?? DEFAULT_LAYOUT.nodeWidth}
          height={node.measured?.height ?? DEFAULT_LAYOUT.nodeHeight}
          rx={12}
          fill={nodeColour(node)}
        />
      ))}

      {/*
       * One path with two rings and an even-odd fill: the frame, minus
       * the window. Everything you are *not* looking at is dimmed, so
       * the bright patch is exactly where you are — and when the window
       * is larger than the whole graph, nothing dims, which is the
       * correct answer to "what am I missing?".
       */}
      <path
        fillRule="evenodd"
        fill="rgba(6, 9, 15, 0.68)"
        d={
          `M${frame.x},${frame.y}h${frame.width}v${frame.height}h${-frame.width}Z` +
          `M${view.x},${view.y}h${view.width}v${view.height}h${-view.width}Z`
        }
      />
      <rect
        x={view.x}
        y={view.y}
        width={view.width}
        height={view.height}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        // Otherwise the outline is scaled with the viewBox and comes
        // out as a hairline on a big graph and a slab on a small one.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
