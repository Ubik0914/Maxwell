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

/** Drawn between its two ends, because there is a way through. */
export interface DirectRoute {
  kind: "direct";
  /**
   * Where the line turns from its own row into its target's.
   *
   * Undefined means halfway, which is what a hop to the next column
   * wants: halfway between two neighbouring columns is the gap between
   * them. A line reaching further has to be told, or it would turn in
   * the middle of somebody else's column — see routeEdges.
   */
  centerX?: number;
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
 * ends, so there is nothing to decide. An edge reaching further has a
 * column of other people's work to get past, and it is asked, in this
 * order:
 *
 *   1. **Is there a way through?** The line runs along its own row, turns
 *      down or up in the *gap* between two columns, and runs into its
 *      target. If none of those three runs touches a box, that is the
 *      route: it stays in the picture, it passes over nothing, and every
 *      other line turning in the same gap shares the same vertical, so a
 *      dozen tasks converging on the goal come together into one trunk
 *      rather than a dozen separate detours.
 *   2. **Otherwise, out of the picture.** Up over the top of everything
 *      or down under the bottom of it, on the side the edge's own two
 *      ends are already on — so a line taken out never crosses the spine
 *      the reader is following — and back in at the far end.
 *
 * Asking first is the whole point. Sending every long edge outside
 * regardless is what a story of twenty books all finishing at the same
 * goal turns into: twenty lanes stacked outwards, a picture several
 * screens tall made of detours around an obstacle that was never there.
 * The outside is an escape route, not a filing system.
 *
 * Lanes, for the ones that do go out, are packed: sorted by how far each
 * reaches and given the innermost lane still free over its whole span.
 * Two that never overlap share a lane, and where they do overlap the
 * longer goes outside the shorter, so the lines nest instead of
 * crossing.
 *
 * This reads positions rather than producing them, so it stays right
 * while a node is being dragged: the ranks come from the edges, which
 * dragging does not change, and everything else comes from wherever the
 * boxes currently are.
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
  const gaps = gapsBetweenColumns(nodes, nodeWidth);
  const boxes = nodes.map((node) => ({
    id: node.id,
    left: node.positionX,
    right: node.positionX + nodeWidth,
    top: node.positionY,
    bottom: node.positionY + nodeHeight,
  }));

  for (const edge of index.edges) {
    const source = at.get(edge.sourceNodeId)!;
    const target = at.get(edge.targetNodeId)!;
    const span =
      (rank.get(edge.targetNodeId) ?? 0) - (rank.get(edge.sourceNodeId) ?? 0);

    if (span < LONG_EDGE_RANKS) {
      routes.set(edge.id, { kind: "direct" });
      continue;
    }

    const from = { x: source.positionX + nodeWidth, y: centreOf(source) };
    const to = { x: target.positionX, y: centreOf(target) };
    const corner = clearCorner(from, to, gaps, boxes, edge);

    if (corner !== undefined) {
      routes.set(edge.id, { kind: "direct", centerX: corner });
      continue;
    }

    const middle = (from.y + to.y) / 2;
    long.push({
      edge,
      side: middle <= axis ? "above" : "below",
      from: Math.min(from.x, to.x),
      to: Math.max(from.x, to.x),
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

interface Box {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * How much air a line keeps from a box it is passing.
 *
 * Small: this is the difference between "clear" and "touching", not a
 * margin worth spending space on. A line grazing the corner of a card
 * reads as going through it.
 */
const GRAZE = 6;

/**
 * The middle of each empty band between one column of nodes and the
 * next.
 *
 * A long line has to change rows somewhere, and the somewhere has to be
 * a place with no boxes in it. Columns are read off the positions
 * rather than assumed, so this still answers correctly for a graph
 * somebody has dragged into a shape of their own.
 */
function gapsBetweenColumns(nodes: GraphNode[], nodeWidth: number): number[] {
  const lefts = [...new Set(nodes.map((node) => node.positionX))].sort(
    (a, b) => a - b,
  );

  const gaps: number[] = [];
  for (let at = 1; at < lefts.length; at += 1) {
    const before = lefts[at - 1] + nodeWidth;
    const after = lefts[at];
    if (after > before) gaps.push((before + after) / 2);
  }
  return gaps;
}

function segmentHits(
  a: Point,
  b: Point,
  boxes: Box[],
  skip: ReadonlySet<string>,
): boolean {
  const left = Math.min(a.x, b.x) - GRAZE;
  const right = Math.max(a.x, b.x) + GRAZE;
  const top = Math.min(a.y, b.y) - GRAZE;
  const bottom = Math.max(a.y, b.y) + GRAZE;

  // Every run here is horizontal or vertical, so overlap is enough —
  // there is no diagonal to clip.
  return boxes.some(
    (box) =>
      !skip.has(box.id) &&
      left < box.right &&
      box.left < right &&
      top < box.bottom &&
      box.top < bottom,
  );
}

/**
 * Where a long edge can turn without touching anything, or undefined if
 * there is nowhere.
 *
 * Candidates are the gaps between the columns it spans, tried nearest
 * the middle first so the line is balanced, and the later of two equally
 * good ones — which puts the turn close to the target, so everything
 * arriving at the same task turns in the same place and comes in as one
 * trunk.
 */
function clearCorner(
  from: Point,
  to: Point,
  gaps: number[],
  boxes: Box[],
  edge: GraphEdge,
): number | undefined {
  const skip = new Set([edge.sourceNodeId, edge.targetNodeId]);
  const middle = (from.x + to.x) / 2;

  const candidates = gaps
    .filter((x) => x > from.x && x < to.x)
    .sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || b - a);

  for (const x of candidates) {
    const clear =
      !segmentHits(from, { x, y: from.y }, boxes, skip) &&
      !segmentHits({ x, y: from.y }, { x, y: to.y }, boxes, skip) &&
      !segmentHits({ x, y: to.y }, to, boxes, skip);
    if (clear) return x;
  }

  return undefined;
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
