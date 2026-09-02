import type { GraphEdge, GraphNode } from "@/domain/graph/types";
import type { LayoutOptions, Point } from "@/domain/graph/layout-options";
import { LONG_EDGE_RANKS } from "@/domain/graph/layout-options";

/**
 * What a picture costs, so that two arrangements of the same graph can
 * be compared by something other than taste.
 *
 * The weights encode an order of priorities rather than an exchange
 * rate. In descending importance:
 *
 *   crossings and collisions  — lines that cross, and lines drawn over
 *                               boxes, are the two things that make a
 *                               graph unreadable rather than untidy
 *   long edges                — a dependency that reaches across the
 *                               picture is a thing to be avoided where
 *                               the ranks allow it, not merely drawn
 *   total edge length         — shorter lines are easier to follow
 *   movement                  — and, all else equal, leave what is
 *                               already on screen where it is
 *
 * Compactness is not in the list at all. A smaller picture that is
 * harder to read is not a better picture.
 */
export const WEIGHTS = {
  edgeCrossings: 100,
  edgeNodeIntersections: 100,
  backwardEdges: 100,
  longEdges: 20,
  totalEdgeLength: 2,
  layoutMovement: 1,
} as const;

export interface LayoutQuality {
  edgeCrossings: number;
  edgeNodeIntersections: number;
  backwardEdges: number;
  longEdges: number;
  /** In strides — one is a hop to the next column, or the next row. */
  totalEdgeLength: number;
  /** Likewise, summed over every node that had a position before. */
  layoutMovement: number;
  total: number;
}

interface Segment {
  a: Point;
  b: Point;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Where a connection is actually drawn from and to: out of the right
 * of one card, into the left of the next, level with the middle of
 * each. Both node types put their handles there.
 */
function anchors(
  source: Point,
  target: Point,
  { nodeWidth, nodeHeight }: LayoutOptions,
): Segment {
  return {
    a: { x: source.x + nodeWidth, y: source.y + nodeHeight / 2 },
    b: { x: target.x, y: target.y + nodeHeight / 2 },
  };
}

function boxOf(point: Point, { nodeWidth, nodeHeight }: LayoutOptions): Box {
  return {
    left: point.x,
    right: point.x + nodeWidth,
    top: point.y,
    bottom: point.y + nodeHeight,
  };
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function side(value: number): number {
  return value > 1e-9 ? 1 : value < -1e-9 ? -1 : 0;
}

/**
 * Whether two segments properly cross — sharing an endpoint does not
 * count. Two edges out of the same task meet at that task; that is the
 * task, not a crossing.
 */
function segmentsCross(first: Segment, second: Segment): boolean {
  const d1 = side(cross(first.a, first.b, second.a));
  const d2 = side(cross(first.a, first.b, second.b));
  const d3 = side(cross(second.a, second.b, first.a));
  const d4 = side(cross(second.a, second.b, first.b));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Whether a segment passes through a box, by clipping it against one. */
function segmentHitsBox({ a, b }: Segment, box: Box): boolean {
  let enter = 0;
  let leave = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  const clip = (direction: number, distance: number): boolean => {
    if (Math.abs(direction) < 1e-9) return distance <= 0;
    const t = distance / direction;
    if (direction < 0) {
      if (t > leave) return false;
      if (t > enter) enter = t;
    } else {
      if (t < enter) return false;
      if (t < leave) leave = t;
    }
    return true;
  };

  return (
    clip(-dx, a.x - box.left) &&
    clip(dx, box.right - a.x) &&
    clip(-dy, a.y - box.top) &&
    clip(dy, box.bottom - a.y)
  );
}

/**
 * Reads a drawn graph and says what is wrong with it.
 *
 * Only the edges drawn *through* the picture are counted for crossings
 * and collisions. An edge spanning two ranks or more is routed around
 * the outside of the whole graph instead (see edge-route), where it
 * meets no node and no other line's body — so counting it here would
 * be scoring a line that is not there. It is counted once, as a long
 * edge, which is the cost it actually has: a dependency you have to
 * follow around the edge of the picture.
 */
export function scoreLayout({
  nodes,
  edges,
  positions,
  rank,
  previous,
  options,
  outerRouted,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Map<string, Point>;
  rank: Map<string, number>;
  /** Where each node was before, for the movement term. */
  previous: Map<string, Point>;
  options: LayoutOptions;
  /**
   * The edges drawn around the outside rather than through the picture.
   * Defaults to the ones the router will take out — anything spanning
   * two ranks or more — and is passed explicitly only to score a
   * drawing that routes differently, which is what makes a before and
   * after comparable.
   */
  outerRouted?: ReadonlySet<string>;
}): LayoutQuality {
  const strideX = options.nodeWidth + options.gapX;
  const strideY = options.nodeHeight + options.gapY;

  const drawn = edges.filter(
    (edge) => positions.has(edge.sourceNodeId) && positions.has(edge.targetNodeId),
  );
  const spanOf = (edge: GraphEdge) =>
    (rank.get(edge.targetNodeId) ?? 0) - (rank.get(edge.sourceNodeId) ?? 0);

  const longEdges = drawn.filter((edge) => spanOf(edge) >= LONG_EDGE_RANKS).length;
  const backwardEdges = drawn.filter(
    (edge) =>
      positions.get(edge.targetNodeId)!.x <= positions.get(edge.sourceNodeId)!.x,
  ).length;

  const isOuter = (edge: GraphEdge) =>
    outerRouted ? outerRouted.has(edge.id) : spanOf(edge) >= LONG_EDGE_RANKS;

  const direct = drawn
    .filter((edge) => !isOuter(edge))
    .map((edge) => ({
      edge,
      line: anchors(
        positions.get(edge.sourceNodeId)!,
        positions.get(edge.targetNodeId)!,
        options,
      ),
    }));

  let edgeCrossings = 0;
  for (let i = 0; i < direct.length; i += 1) {
    for (let j = i + 1; j < direct.length; j += 1) {
      if (segmentsCross(direct[i].line, direct[j].line)) edgeCrossings += 1;
    }
  }

  let edgeNodeIntersections = 0;
  for (const { edge, line } of direct) {
    for (const node of nodes) {
      if (node.id === edge.sourceNodeId || node.id === edge.targetNodeId) continue;
      const at = positions.get(node.id);
      if (at && segmentHitsBox(line, boxOf(at, options))) edgeNodeIntersections += 1;
    }
  }

  const totalEdgeLength = drawn.reduce((sum, edge) => {
    const { a, b } = anchors(
      positions.get(edge.sourceNodeId)!,
      positions.get(edge.targetNodeId)!,
      options,
    );
    return sum + Math.abs(b.x - a.x) / strideX + Math.abs(b.y - a.y) / strideY;
  }, 0);

  const layoutMovement = [...positions].reduce((sum, [id, point]) => {
    const was = previous.get(id);
    if (!was) return sum;
    return (
      sum +
      Math.abs(point.x - was.x) / strideX +
      Math.abs(point.y - was.y) / strideY
    );
  }, 0);

  const total =
    edgeCrossings * WEIGHTS.edgeCrossings +
    edgeNodeIntersections * WEIGHTS.edgeNodeIntersections +
    backwardEdges * WEIGHTS.backwardEdges +
    longEdges * WEIGHTS.longEdges +
    totalEdgeLength * WEIGHTS.totalEdgeLength +
    layoutMovement * WEIGHTS.layoutMovement;

  return {
    edgeCrossings,
    edgeNodeIntersections,
    backwardEdges,
    longEdges,
    totalEdgeLength,
    layoutMovement,
    total,
  };
}
