import type { GraphNode, GraphEdge } from "@/domain/graph/types";
import {
  DEFAULT_LAYOUT,
  type LayoutOptions,
  type Point,
} from "@/domain/graph/layout-options";
import {
  groupByRank,
  indexGraph,
  rankNodes,
  type GraphIndex,
} from "@/domain/graph/rank";
import { findSpine } from "@/domain/graph/spine";
import {
  candidateOrderings,
  familyOf,
  PREDECESSOR_PULL,
  SUCCESSOR_PULL,
} from "@/domain/graph/ordering";
import { scoreLayout, type LayoutQuality } from "@/domain/graph/layout-score";
import { routeEdges } from "@/domain/graph/edge-route";

export {
  DEFAULT_LAYOUT,
  type LayoutOptions,
  type Point,
} from "@/domain/graph/layout-options";

/**
 * How many times the rows are allowed to settle against each other.
 *
 * Each pass moves every node towards the average of its neighbours and
 * then pushes the column apart again to keep them from touching. It
 * converges quickly — the graph is a DAG, so information only has to
 * travel a few columns — and alternating direction is what stops the
 * left of the picture deciding everything.
 */
const RELAXATIONS = 6;

/**
 * Somewhere to put a task nobody said where to put.
 *
 * The canvas asks the pointer where a new task goes, so this is for the
 * callers that have no pointer — the CLI, the MCP server, a script. They
 * used to have to invent coordinates, which meant inventing (0, 0) and
 * dropping every task they made on top of START.
 *
 * One column in from the start and below everything else: unattached
 * tasks pile up in a readable stack instead of a heap, and the moment
 * one is connected to something, auto-layout puts it where the
 * dependencies say it belongs. This is a place to land, not an opinion
 * about the graph.
 */
export function nextFreeSpot(
  nodes: GraphNode[],
  { nodeWidth, nodeHeight, gapX, gapY }: LayoutOptions = DEFAULT_LAYOUT,
): Point {
  if (nodes.length === 0) return { x: 0, y: 0 };

  const start = nodes.find((node) => node.type === "START");
  const left = start?.positionX ?? Math.min(...nodes.map((n) => n.positionX));
  const bottom = Math.max(...nodes.map((node) => node.positionY));

  return { x: left + nodeWidth + gapX, y: bottom + nodeHeight + gapY };
}

/**
 * Arranges a story left to right, around the line that runs through it.
 *
 * The aim is not the smallest picture. It is a picture whose subject is
 * obvious: START to GOAL along one horizontal axis, with everything
 * else hanging off that axis as a branch, and nothing crossing the
 * middle that does not belong there.
 *
 * Four decisions, in this order:
 *
 *   1. **Which column.** The longest path from the start of the graph,
 *      so every dependency is strictly to the left and the picture can
 *      be read as time. See rankNodes.
 *   2. **Which line is the spine.** The longest START-to-GOAL path —
 *      the critical path, the one that decides when the story can
 *      finish. It is pinned to y = 0 in every column it passes through,
 *      so it comes out as a straight horizontal run. See findSpine.
 *   3. **What order each column is in.** Barycentre sweeps in both
 *      directions to untangle crossings, with families kept together as
 *      blocks. Several orderings are tried rather than one. See
 *      candidateOrderings.
 *   4. **What height each row sits at.** Each node settles towards the
 *      average of its neighbours, leaning towards its successors, and
 *      the column is then pushed apart just enough to keep the order it
 *      was given. See assignRows.
 *
 * Every candidate is laid out in full and scored — crossings and
 * collisions first, then long edges, then line length, then how far
 * anything had to move — and the best drawing wins. See scoreLayout.
 * Ties go to the earliest candidate, which is the order that came in:
 * a re-run that cannot do better leaves the graph exactly where it was.
 *
 * What this deliberately does *not* do is route long edges. An edge
 * spanning two ranks or more is drawn around the outside of the whole
 * picture rather than through it, which is a question about the drawing
 * and not about where the boxes go — see edge-route.
 */
export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions = DEFAULT_LAYOUT,
): Map<string, Point> {
  return layoutStory(nodes, edges, options).positions;
}

export interface StoryLayout {
  positions: Map<string, Point>;
  /** The main line, START to GOAL, in order. Empty if there isn't one. */
  spine: string[];
  rank: Map<string, number>;
  /** What the chosen arrangement scored — the same numbers a test or a
   *  future change can compare against. */
  quality: LayoutQuality;
}

/** The whole answer, for the callers that want more than coordinates. */
export function layoutStory(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions = DEFAULT_LAYOUT,
): StoryLayout {
  const empty: StoryLayout = {
    positions: new Map(),
    spine: [],
    rank: new Map(),
    quality: {
      edgeCrossings: 0,
      edgeNodeIntersections: 0,
      backwardEdges: 0,
      longEdges: 0,
      totalEdgeLength: 0,
      layoutMovement: 0,
      total: 0,
    },
  };
  if (nodes.length === 0) return empty;

  const index = indexGraph(nodes, edges);
  const rank = rankNodes(nodes, index);
  const spine = findSpine(nodes, index, rank);
  const onSpine = new Set(spine);

  // Seeded from where the nodes already are, so a graph somebody has
  // arranged by hand is re-tidied rather than rebuilt.
  const ranks = groupByRank(nodes, rank).map((ids) => seedOrder(ids, nodes));

  const previous = new Map(
    nodes.map((node) => [node.id, { x: node.positionX, y: node.positionY }]),
  );

  let best: StoryLayout | null = null;

  for (const candidate of candidateOrderings({ ranks, index, spine: onSpine })) {
    const positions = place(candidate, index, onSpine, options);
    // Routed before it is judged: how a connection is drawn depends on
    // where the boxes landed, and what the drawing costs depends on how
    // the connections are drawn.
    const drawn = nodes.map((node) => ({
      ...node,
      positionX: positions.get(node.id)?.x ?? node.positionX,
      positionY: positions.get(node.id)?.y ?? node.positionY,
    }));
    const quality = scoreLayout({
      nodes,
      edges: index.edges,
      positions,
      rank,
      previous,
      options,
      routes: routeEdges(drawn, index.edges, options),
    });

    if (best === null || quality.total < best.quality.total) {
      best = { positions, spine, rank, quality };
    }
  }

  return best ?? empty;
}

/**
 * The order to start a rank in: the order it is already drawn in.
 *
 * Sorting by the position on screen rather than by the order the rows
 * came back from the database is what makes the first candidate — the
 * one that changes nothing — actually mean "leave it alone". On a fresh
 * graph every node is at the same place and this is a no-op.
 */
function seedOrder(ids: string[], nodes: GraphNode[]): string[] {
  const y = new Map(nodes.map((node) => [node.id, node.positionY]));
  const given = new Map(ids.map((id, at) => [id, at]));
  return [...ids].sort(
    (a, b) => (y.get(a) ?? 0) - (y.get(b) ?? 0) || given.get(a)! - given.get(b)!,
  );
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Where every node ends up.
 *
 * X is the rank, and nothing negotiates about it. Y settles: each
 * node is drawn towards the average of what feeds it and what it feeds,
 * leaning towards the latter, and then each column is pushed apart just
 * enough that its rows keep the order the sweeps chose and never touch.
 *
 * Two rows of the same family are given the ordinary gap; two rows from
 * different families are given a wider one. That difference is the
 * whole of what makes a fan read as a fan — the eye groups by relative
 * distance, so a block only looks like a block while the space around
 * it is clearly bigger than the space inside it.
 *
 * A column holding a spine node is then slid so that node sits exactly
 * on zero. That is what turns the main line into a straight horizontal
 * run instead of a nearly-straight one, and it is worth more than the
 * few pixels of balance it costs the rest of the column.
 */
function place(
  ranks: string[][],
  index: GraphIndex,
  spine: ReadonlySet<string>,
  options: LayoutOptions,
): Map<string, Point> {
  const { nodeWidth, nodeHeight, gapX, gapY, groupGapY } = options;
  const strideX = nodeWidth + gapX;

  const family = new Map<string, string>();
  for (const rank of ranks) {
    for (const id of rank) family.set(id, familyOf(id, index));
  }

  const gapBetween = (above: string, below: string) =>
    nodeHeight +
    (family.get(above) === family.get(below) ? gapY : groupGapY);

  const y = new Map<string, number>();

  // A first stacking, so that every node has a height to be averaged
  // before anything averages it.
  for (const rank of ranks) {
    const tops: number[] = [];
    rank.forEach((id, row) => {
      tops.push(row === 0 ? 0 : tops[row - 1] + gapBetween(rank[row - 1], id));
    });
    const centre = mean(tops);
    rank.forEach((id, row) => y.set(id, tops[row] - centre));
  }

  for (let pass = 0; pass < RELAXATIONS; pass += 1) {
    const order = ranks.map((_, at) => at);
    // Left to right, then right to left. One direction alone would let
    // the start of the graph decide the whole picture.
    if (pass % 2 === 1) order.reverse();

    for (const at of order) {
      const column = ranks[at];
      if (column.length === 0) continue;

      const wanted = new Map(
        column.map((id) => [id, desiredHeight(id, index, spine, y)]),
      );

      const placed: number[] = [];
      column.forEach((id, row) => {
        const want = wanted.get(id)!;
        placed.push(
          row === 0
            ? want
            : Math.max(want, placed[row - 1] + gapBetween(column[row - 1], id)),
        );
      });

      // Pushing apart always pushes downwards, so the column is slid
      // back to straddle the heights it asked for — unless it holds a
      // piece of the main line, in which case that is what it is slid
      // to.
      const anchor = column.find((id) => spine.has(id));
      const drift =
        anchor !== undefined
          ? placed[column.indexOf(anchor)]
          : mean(placed) - mean(column.map((id) => wanted.get(id)!));

      column.forEach((id, row) => y.set(id, placed[row] - drift));
    }
  }

  const positions = new Map<string, Point>();
  ranks.forEach((rank, at) => {
    for (const id of rank) {
      positions.set(id, { x: at * strideX, y: y.get(id) ?? 0 });
    }
  });

  // With no main line to hang it on, the story is centred on itself so
  // it still sits around the origin.
  if (spine.size === 0 && positions.size > 0) {
    const centre = mean([...positions.values()].map((point) => point.y));
    for (const [id, point] of positions) {
      positions.set(id, { x: point.x, y: point.y - centre });
    }
  }

  return positions;
}

/**
 * The height a node is aiming for: the average of what feeds it and the
 * average of what it feeds, with the second weighted heavier.
 *
 * A reader follows the graph forwards, so leaning towards the
 * successors is what makes a fan converge on its join rather than
 * spreading and then doubling back into it. Spine nodes want zero; a
 * node with nothing either side keeps the height it has.
 */
function desiredHeight(
  id: string,
  index: GraphIndex,
  spine: ReadonlySet<string>,
  y: Map<string, number>,
): number {
  if (spine.has(id)) return 0;

  const heights = (ids: string[]) =>
    ids
      .map((neighbour) => y.get(neighbour))
      .filter((value): value is number => value !== undefined);

  const before = heights(index.predecessors.get(id) ?? []);
  const after = heights(index.successors.get(id) ?? []);

  if (before.length === 0 && after.length === 0) return y.get(id) ?? 0;
  if (before.length === 0) return mean(after);
  if (after.length === 0) return mean(before);
  return PREDECESSOR_PULL * mean(before) + SUCCESSOR_PULL * mean(after);
}
