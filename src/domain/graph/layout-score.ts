import type { GraphEdge, GraphNode } from "@/domain/graph/types";
import type { LayoutOptions, Point } from "@/domain/graph/layout-options";
import { LONG_EDGE_RANKS } from "@/domain/graph/layout-options";
import { outerRoutePoints, type EdgeRoute } from "@/domain/graph/edge-route";

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
 * Where a connection leaves and arrives: out of the right of one card,
 * into the left of the next, level with the middle of each. Both node
 * types put their handles there.
 */
function ends(
  source: Point,
  target: Point,
  { nodeWidth, nodeHeight }: LayoutOptions,
): [Point, Point] {
  return [
    { x: source.x + nodeWidth, y: source.y + nodeHeight / 2 },
    { x: target.x, y: target.y + nodeHeight / 2 },
  ];
}

/**
 * The line as it is actually drawn, corner by corner.
 *
 * Scoring the straight line between two ends would be scoring a picture
 * nobody is looking at: every connection here is a stepped run — along
 * its own row, across at a turn, into its target — or a detour around
 * the outside. Two of those can share a whole vertical without
 * crossing, and one of them can miss a box a straight line would have
 * gone through.
 */
function polyline(
  from: Point,
  to: Point,
  route: EdgeRoute | undefined,
): Point[] {
  if (route?.kind === "outer") return outerRoutePoints(from, to, route.laneY);
  const turn = route?.centerX ?? (from.x + to.x) / 2;
  return [from, { x: turn, y: from.y }, { x: turn, y: to.y }, to];
}

function segmentsOf(points: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let at = 1; at < points.length; at += 1) {
    segments.push({ a: points[at - 1], b: points[at] });
  }
  return segments;
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
 * Every connection is measured as it is drawn — the routes are passed
 * in, not guessed at — so a line taken around the outside is counted
 * where it actually goes, and a line that turns in an empty gap is not
 * charged for the boxes a straight line between the same two ends would
 * have crossed.
 *
 * A long edge still costs something whichever way it is drawn: it is a
 * dependency the reader has to follow a long way, and the layout should
 * prefer an arrangement with fewer of them where the ranks allow it.
 */
export function scoreLayout({
  nodes,
  edges,
  positions,
  rank,
  previous,
  options,
  routes,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Map<string, Point>;
  rank: Map<string, number>;
  /** Where each node was before, for the movement term. */
  previous: Map<string, Point>;
  options: LayoutOptions;
  /** How each edge is drawn — see routeEdges. */
  routes: Map<string, EdgeRoute>;
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

  const lines = drawn.map((edge) => {
    const [from, to] = ends(
      positions.get(edge.sourceNodeId)!,
      positions.get(edge.targetNodeId)!,
      options,
    );
    return { edge, run: segmentsOf(polyline(from, to, routes.get(edge.id))) };
  });

  let edgeCrossings = 0;
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      // Once per pair of lines, however many of their segments meet:
      // one connection laid over another is one thing to untangle.
      const meets = lines[i].run.some((first) =>
        lines[j].run.some((second) => segmentsCross(first, second)),
      );
      if (meets) edgeCrossings += 1;
    }
  }

  let edgeNodeIntersections = 0;
  for (const { edge, run } of lines) {
    for (const node of nodes) {
      if (node.id === edge.sourceNodeId || node.id === edge.targetNodeId) continue;
      const at = positions.get(node.id);
      if (!at) continue;
      const box = boxOf(at, options);
      if (run.some((segment) => segmentHitsBox(segment, box))) {
        edgeNodeIntersections += 1;
      }
    }
  }

  const totalEdgeLength = lines.reduce(
    (sum, { run }) =>
      sum +
      run.reduce(
        (length, { a, b }) =>
          length +
          Math.abs(b.x - a.x) / strideX +
          Math.abs(b.y - a.y) / strideY,
        0,
      ),
    0,
  );

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
