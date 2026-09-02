import type { GraphEdge, GraphNode } from "@/domain/graph/types";
import {
  DEFAULT_LAYOUT,
  LONG_EDGE_RANKS,
  type LayoutOptions,
  type Point,
} from "@/domain/graph/layout-options";
import { indexGraph, rankNodes } from "@/domain/graph/rank";
import { findSpine } from "@/domain/graph/spine";

/**
 * How far a long edge runs straight out of a node before it turns.
 *
 * Enough that the first corner is clearly past the card rather than
 * against it, and that several lines leaving the same column turn at
 * the same place instead of at slightly different ones.
 */
export const OUTER_STUB = 40;

/** Drawn between its two ends, because there is nothing in the way. */
export interface DirectRoute {
  kind: "direct";
}

/**
 * Drawn out of the picture, along a lane above or below everything,
 * and back in. `laneY` is the height of that lane in canvas
 * coordinates.
 */
export interface OuterRoute {
  kind: "outer";
  side: "above" | "below";
  laneY: number;
}

export type EdgeRoute = DirectRoute | OuterRoute;

/**
 * Which connections are drawn through the picture and which go round
 * it.
 *
 * An edge between neighbouring columns has nothing between its two
 * ends, so it is a short diagonal and there is nothing to decide. An
 * edge that spans two ranks or more has a whole column of other
 * people's work in the way, and drawing it straight is what puts a line
 * across the middle of the graph, over whatever happens to be there.
 * Those are taken out of the body of the drawing altogether: up over
 * the top of everything, or down under the bottom of it, and back in at
 * the far end.
 *
 * Which of the two is decided by where the edge's own ends already are.
 * A dependency between two tasks that both sit above the main line has
 * no business dipping below it, and vice versa — so a long edge never
 * crosses the spine, which is the line the reader is following.
 *
 * Lanes are then packed: sorted by how far each edge reaches and given
 * the innermost lane that is still free over its whole span. Two edges
 * that never overlap share a lane, and where they do overlap the longer
 * one goes outside the shorter, so the lines nest instead of crossing.
 *
 * This reads positions rather than producing them, so it stays right
 * while a node is being dragged: the ranks come from the edges, which
 * dragging does not change, and the lanes come from wherever the boxes
 * currently are.
 */
export function routeEdges(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions = DEFAULT_LAYOUT,
): Map<string, EdgeRoute> {
  const routes = new Map<string, EdgeRoute>();
  if (nodes.length === 0) return routes;

  const index = indexGraph(nodes, edges);
  const rank = rankNodes(nodes, index);
  const at = new Map(nodes.map((node) => [node.id, node]));

  const { nodeWidth, nodeHeight, edgeClearance } = options;
  const centreOf = (node: GraphNode) => node.positionY + nodeHeight / 2;

  const top = Math.min(...nodes.map((node) => node.positionY));
  const bottom = Math.max(...nodes.map((node) => node.positionY + nodeHeight));

  /*
   * The height the reader's eye is following. The spine if there is
   * one; otherwise the middle of everything, which is the same idea
   * with less to go on.
   */
  const spine = findSpine(nodes, index, rank)
    .map((id) => at.get(id))
    .filter((node): node is GraphNode => node !== undefined);
  const axis =
    spine.length > 0
      ? spine.reduce((sum, node) => sum + centreOf(node), 0) / spine.length
      : (top + bottom) / 2;

  interface Long {
    edge: GraphEdge;
    side: "above" | "below";
    from: number;
    to: number;
  }

  const long: Long[] = [];

  for (const edge of index.edges) {
    const source = at.get(edge.sourceNodeId)!;
    const target = at.get(edge.targetNodeId)!;
    const span =
      (rank.get(edge.targetNodeId) ?? 0) - (rank.get(edge.sourceNodeId) ?? 0);

    if (span < LONG_EDGE_RANKS) {
      routes.set(edge.id, { kind: "direct" });
      continue;
    }

    const middle = (centreOf(source) + centreOf(target)) / 2;
    long.push({
      edge,
      side: middle <= axis ? "above" : "below",
      from: Math.min(source.positionX + nodeWidth, target.positionX),
      to: Math.max(source.positionX + nodeWidth, target.positionX),
    });
  }

  for (const side of ["above", "below"] as const) {
    const taken: { from: number; to: number }[][] = [];

    const onThisSide = long
      .filter((entry) => entry.side === side)
      .sort(
        (a, b) =>
          a.to - a.from - (b.to - b.from) || a.edge.id.localeCompare(b.edge.id),
      );

    for (const entry of onThisSide) {
      let lane = 0;
      // The innermost lane this edge fits in without meeting another.
      // Shorter edges are placed first, so a longer one that overlaps
      // is pushed outside it rather than through it.
      while (
        taken[lane]?.some(
          (span) => entry.from < span.to && span.from < entry.to,
        )
      ) {
        lane += 1;
      }

      (taken[lane] ??= []).push({ from: entry.from, to: entry.to });

      routes.set(entry.edge.id, {
        kind: "outer",
        side,
        laneY:
          side === "above"
            ? top - edgeClearance * (lane + 1)
            : bottom + edgeClearance * (lane + 1),
      });
    }
  }

  return routes;
}

/**
 * The corners a long edge turns, in order: out of the source, up or
 * down to its lane, along it, then back in at the target.
 *
 * Given as points rather than as a path so that the geometry stays
 * testable and the drawing stays in the component that draws.
 */
export function outerRoutePoints(
  source: Point,
  target: Point,
  laneY: number,
): Point[] {
  // A stub that would overshoot is shortened rather than doubling the
  // line back on itself, which is what a very short span would do.
  const room = Math.max(0, (target.x - source.x) / 2);
  const stub = Math.min(OUTER_STUB, room);

  return [
    source,
    { x: source.x + stub, y: source.y },
    { x: source.x + stub, y: laneY },
    { x: target.x - stub, y: laneY },
    { x: target.x - stub, y: target.y },
    target,
  ];
}
