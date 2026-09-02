import type { GraphNode, GraphEdge } from "@/domain/graph/types";

export interface Point {
  x: number;
  y: number;
}

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  gapX: number;
  gapY: number;
}

/**
 * Measured from the node the graph actually draws, not estimated: 170
 * wide by 75 tall, which is a two-line title — the most it can be,
 * since the title is clamped at two lines.
 *
 * The height was 64, between a one-line node and a two-line one, so two
 * long titles stacked left 37px of air where the gap says 48 and the
 * rows read as crowded. A layout that assumes a node is smaller than it
 * is will always draw them too close together; assuming the largest is
 * the only assumption that cannot be wrong in the direction that shows.
 */
export const DEFAULT_LAYOUT: LayoutOptions = {
  nodeWidth: 170,
  nodeHeight: 75,
  gapX: 110,
  gapY: 48,
};

/** How many barycentre sweeps to run. Past a handful it stops paying. */
const SWEEPS = 4;

/**
 * How many rows a column may hold before it wraps into a second column
 * of its own, and how far that wrapping is allowed to go.
 *
 * A column is a set of tasks nothing separates, so a story that opens
 * with twenty independent pieces of work has one column twenty rows
 * tall — some 2,400px, a picture you can only read by scrolling past
 * the ends of every edge that leads into it. Width is the cheaper
 * direction: the canvas pans both ways, but a column that overflows the
 * viewport vertically breaks the one thing the layout is for, which is
 * seeing what runs beside what.
 *
 * So a wide column wraps, the way a paragraph does. Six rows is about a
 * laptop's worth of height; past that the tasks continue in a second
 * column of the same layer, then a third, up to four — beyond which the
 * graph is wider than any screen and growing it further stops buying
 * anything. The wrapped columns are whole columns, a full stride apart,
 * because half a stride would put one column's boxes through the next
 * one's, and not overlapping is the part of this that is not a matter
 * of taste.
 */
const MAX_ROWS = 6;
const MAX_WRAP = 4;

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
 * Arranges a story left to right, in the order the work actually has to
 * happen.
 *
 * A node's column is the *longest* path from the start of the graph, not
 * the shortest: put a task one step after its deepest prerequisite and
 * every dependency is guaranteed to sit to its left, so an edge never
 * doubles back and the picture can be read as time. Tasks that could run
 * at the same moment end up in the same column, which is the other thing
 * the layout is for — a column is a set of things nothing separates.
 *
 * Within a column the order comes from a barycentre heuristic: put each
 * node level with the average of its neighbours, sweep a few times, and
 * most crossings fall out. This is the cheap half of Sugiyama and not
 * the optimal answer — crossing minimisation is NP-hard, and a task
 * graph someone is reading does not need the optimal answer.
 *
 * An edge that spans more than one column gets a placeholder in each
 * column it passes over. Without them a task in column 1 that runs
 * straight to the goal in column 5 is drawn as a line across three
 * columns of nodes, over whatever happens to be in the way — and the
 * ordering could not see the edge at all, because a barycentre is only
 * meaningful between neighbouring columns. The placeholders are never
 * drawn. They take a row of their own in each column they cross, which
 * is what leaves an empty lane for the line to run along, and they give
 * both ends something adjacent to be pulled level with.
 *
 * A layer with more tasks in it than MAX_ROWS is wrapped over several
 * columns rather than drawn as one very tall one — see wrapWideLayers.
 * Everything below this line then works in columns on the canvas, and
 * only `layerOf` remembers which of them were once the same layer.
 */
export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions = DEFAULT_LAYOUT,
): Map<string, Point> {
  if (nodes.length === 0) return new Map();

  const ids = new Set(nodes.map((node) => node.id));
  const live = edges.filter(
    (edge) => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId),
  );

  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  const indegree = new Map<string, number>(nodes.map((node) => [node.id, 0]));

  for (const edge of live) {
    successors.set(edge.sourceNodeId, [
      ...(successors.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId,
    ]);
    predecessors.set(edge.targetNodeId, [
      ...(predecessors.get(edge.targetNodeId) ?? []),
      edge.sourceNodeId,
    ]);
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  const column = assignColumns(nodes, successors, indegree);

  // GOAL is where the story ends, so it belongs past everything even if
  // some branch doesn't happen to reach it yet. START is symmetrical.
  const lastColumn = Math.max(...column.values());
  for (const node of nodes) {
    if (node.type === "GOAL") column.set(node.id, lastColumn);
    if (node.type === "START") column.set(node.id, 0);
  }

  // From here on a "column" is a column on the canvas rather than a
  // layer of the graph: a layer too tall to read has been wrapped into
  // several, and `layerOf` is what still remembers which of them belong
  // together.
  const { placement, layerOf } = wrapWideLayers(nodes, column);

  const columns = groupByColumn(nodes, placement);
  const spanned = addPlaceholders(columns, placement, live, layerOf);
  orderWithinColumns(columns, spanned.predecessors, spanned.successors);

  return toPositions(columns, spanned.predecessors, options);
}

/** A row in a column: a real node, or a lane held for a long edge. */
interface Slot {
  id: string;
  real: boolean;
}

/**
 * Breaks every edge that spans more than one column into single-column
 * hops, adding a placeholder row in each column it crosses.
 *
 * The adjacency handed back is over those hops rather than over the
 * original edges, which is what makes the barycentre sweeps meaningful:
 * every neighbour is now exactly one column away, so "the average
 * position of my neighbours" is a position in the column next door
 * instead of an index into some column three along.
 */
function addPlaceholders(
  columns: Slot[][],
  column: Map<string, number>,
  edges: GraphEdge[],
  layerOf: number[],
): {
  predecessors: Map<string, string[]>;
  successors: Map<string, string[]>;
} {
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    successors.set(from, [...(successors.get(from) ?? []), to]);
    predecessors.set(to, [...(predecessors.get(to) ?? []), from]);
  };

  edges.forEach((edge, index) => {
    const from = column.get(edge.sourceNodeId) ?? 0;
    const to = column.get(edge.targetNodeId) ?? 0;

    // Backwards or within a column: nothing to route around. Longest-
    // path layering makes this impossible for a DAG, and it is checked
    // rather than assumed because a layout must not hang on a graph it
    // did not expect.
    if (to - from <= 1) {
      link(edge.sourceNodeId, edge.targetNodeId);
      return;
    }

    let previous = edge.sourceNodeId;
    for (let at = from + 1; at < to; at += 1) {
      // The columns a wrapped layer was split into are crossed without
      // reserving anything. A row held open in each of them is a row
      // the wrap was supposed to save — every task in the second column
      // of a layer is reached over the first, so reserving there would
      // give the layer back exactly the height it just shed, and it
      // would do it in the columns whose height is the whole point.
      // The line is drawn over its own layer instead; a lane is for
      // crossing somebody else's work, not the work beside you.
      if (layerOf[at] === layerOf[from] || layerOf[at] === layerOf[to]) {
        continue;
      }
      const placeholder = `lane:${index}:${at}`;
      columns[at].push({ id: placeholder, real: false });
      link(previous, placeholder);
      previous = placeholder;
    }
    link(previous, edge.targetNodeId);
  });

  return { predecessors, successors };
}

/**
 * Longest-path layering over a topological order. Anything left
 * unvisited would mean a cycle, which the DAG rules already forbid —
 * it lands in column 0 rather than throwing, because a layout button
 * should never be the thing that fails on a graph you can otherwise
 * still see.
 */
function assignColumns(
  nodes: GraphNode[],
  successors: Map<string, string[]>,
  indegree: Map<string, number>,
): Map<string, number> {
  const remaining = new Map(indegree);
  const column = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  const queue = nodes
    .filter((node) => (remaining.get(node.id) ?? 0) === 0)
    .map((node) => node.id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const next = (column.get(id) ?? 0) + 1;

    for (const target of successors.get(id) ?? []) {
      if (next > (column.get(target) ?? 0)) column.set(target, next);
      const left = (remaining.get(target) ?? 0) - 1;
      remaining.set(target, left);
      if (left === 0) queue.push(target);
    }
  }

  return column;
}

/**
 * Wraps a layer that would be drawn too tall over several columns.
 *
 * Nothing inside a layer depends on anything else inside it — that is
 * what being in the same layer means — so its tasks may be dealt out
 * over as many columns as they like without any edge changing
 * direction. Each wrapped column is offset by a whole column width, and
 * every layer that follows is pushed along by however many its
 * predecessors took, so a node still sits strictly to the right of
 * everything it waits on and strictly to the left of everything waiting
 * on it. That is the property the rest of the file rests on, and
 * wrapping is only allowed because it keeps it.
 *
 * The tasks are dealt out in blocks rather than round-robin: the first
 * six in one column, the next six in the next. A layer's order carries
 * meaning — it is what the barycentre sweeps and the manual sort order
 * put there — and dealing alternately would shuffle neighbours into
 * different columns for no reason a reader could see.
 *
 * `layerOf` is the column-to-layer index that comes back with it. Only
 * addPlaceholders needs it, and only to tell "crossing another layer's
 * column" (which must be routed around) from "crossing the rest of my
 * own layer" (which must not).
 */
function wrapWideLayers(
  nodes: GraphNode[],
  layer: Map<string, number>,
): { placement: Map<string, number>; layerOf: number[] } {
  const depth = Math.max(...layer.values()) + 1;
  const members: string[][] = Array.from({ length: depth }, () => []);
  for (const node of nodes) members[layer.get(node.id) ?? 0].push(node.id);

  const placement = new Map<string, number>();
  const layerOf: number[] = [];

  for (let index = 0; index < depth; index += 1) {
    const ids = members[index];
    const wrap = Math.min(MAX_WRAP, Math.max(1, Math.ceil(ids.length / MAX_ROWS)));
    // Spread evenly rather than filling the first column to the brim:
    // seven tasks read better as four and three than as six and one.
    const rows = Math.ceil(ids.length / wrap);
    const left = layerOf.length;

    ids.forEach((id, at) => {
      placement.set(id, left + Math.min(wrap - 1, Math.floor(at / rows)));
    });
    // An empty layer still owns one column, so nothing downstream has
    // to cope with a gap in the column array.
    for (let taken = 0; taken < Math.max(1, wrap); taken += 1) {
      layerOf.push(index);
    }
  }

  return { placement, layerOf };
}

function groupByColumn(
  nodes: GraphNode[],
  column: Map<string, number>,
): Slot[][] {
  const width = Math.max(...column.values()) + 1;
  const columns: Slot[][] = Array.from({ length: width }, () => []);
  for (const node of nodes) {
    columns[column.get(node.id) ?? 0].push({ id: node.id, real: true });
  }
  return columns;
}

/**
 * Barycentre sweeps, forward then backward, so ordering information
 * propagates from both ends of the graph rather than only from the
 * start. A node with no neighbours in the column being read from keeps
 * its current place instead of collecting at the top.
 */
function orderWithinColumns(
  columns: Slot[][],
  predecessors: Map<string, string[]>,
  successors: Map<string, string[]>,
): void {
  const rank = new Map<string, number>();
  const reindex = () => {
    for (const column of columns) {
      column.forEach((node, index) => rank.set(node.id, index));
    }
  };
  reindex();

  const sweep = (column: Slot[], neighbours: Map<string, string[]>) => {
    const barycentre = new Map<string, number>();
    column.forEach((node, index) => {
      const ranks = (neighbours.get(node.id) ?? [])
        .map((id) => rank.get(id))
        .filter((value): value is number => value !== undefined);
      barycentre.set(
        node.id,
        ranks.length === 0
          ? index
          : ranks.reduce((sum, value) => sum + value, 0) / ranks.length,
      );
    });
    column.sort((a, b) => barycentre.get(a.id)! - barycentre.get(b.id)!);
  };

  for (let pass = 0; pass < SWEEPS; pass += 1) {
    for (let i = 1; i < columns.length; i += 1) sweep(columns[i], predecessors);
    reindex();
    for (let i = columns.length - 2; i >= 0; i -= 1) {
      sweep(columns[i], successors);
    }
    reindex();
  }
}

/**
 * Where each row actually sits.
 *
 * Not "row index times a stride, centred in its column", which is what
 * this was: a column of one and a column of three centre differently,
 * so the same row is at a different height in each, and a lane held
 * open across three columns is not a lane at all — it is three
 * unrelated gaps. That is what put a line through a node box.
 *
 * So a slot is placed level with the average of what feeds it, sweeping
 * left to right, and then the column is pushed apart just enough to
 * keep the order it was given. Feeding a placeholder chain the same
 * number at every step is what makes a long edge come out as a
 * horizontal line, and the same rule keeps a task level with its
 * predecessor when nothing is in the way — which is the spine the
 * centring was there to produce, arrived at from the graph rather than
 * imposed on it.
 *
 * The whole thing is then centred once, so the story still sits around
 * the origin.
 */
function toPositions(
  columns: Slot[][],
  predecessors: Map<string, string[]>,
  { nodeWidth, nodeHeight, gapX, gapY }: LayoutOptions,
): Map<string, Point> {
  const strideX = nodeWidth + gapX;
  const strideY = nodeHeight + gapY;
  const y = new Map<string, number>();

  columns.forEach((column, index) => {
    // Where each slot would like to be: level with what feeds it, or —
    // for anything nothing reaches — where a plain centred column would
    // have put it, so an unconnected task doesn't collect on the axis.
    const wanted = new Map(
      column.map((slot, row) => {
        const feeding = (predecessors.get(slot.id) ?? [])
          .map((id) => y.get(id))
          .filter((value): value is number => value !== undefined);
        return [
          slot.id,
          feeding.length === 0
            ? row * strideY - ((column.length - 1) * strideY) / 2
            : mean(feeding),
        ] as const;
      }),
    );

    // Sorted by where they want to be, not left in the order the
    // sweeps chose. The two are the same idea — the average of your
    // neighbours — but one is in ranks and this one is in pixels, and
    // if they disagree the column is drawn in an order that contradicts
    // its own heights. The sweeps still decide the first column and
    // anything nothing feeds; from there the graph does.
    //
    // A lane wins a tie. It is a line that has to stay level with
    // itself across several columns, while a node beside it only has to
    // be somewhere sensible.
    if (index > 0) {
      column.sort(
        (a, b) =>
          wanted.get(a.id)! - wanted.get(b.id)! ||
          Number(a.real) - Number(b.real),
      );
    }

    // Pushed apart just enough to keep that order, then slid back so
    // the column still straddles where it wanted to be rather than
    // drifting downward every time two slots want the same height.
    const placed: number[] = [];
    column.forEach((slot, row) => {
      const want = wanted.get(slot.id)!;
      placed.push(row === 0 ? want : Math.max(want, placed[row - 1] + strideY));
    });

    // Slid back to put the lanes where they asked to be, when there are
    // any: the whole point of a lane is that the line through it stays
    // level, and a node that had to be moved aside for one has only
    // been moved aside. With no lanes in the column there is nothing to
    // hold, so it straddles its own average as before.
    const anchors = column
      .map((slot, row) => ({ slot, row }))
      .filter(({ slot }) => !slot.real);
    const held = anchors.length > 0 ? anchors : column.map((slot, row) => ({ slot, row }));
    const drift =
      mean(held.map(({ row }) => placed[row])) -
      mean(held.map(({ slot }) => wanted.get(slot.id)!));

    column.forEach((slot, row) => y.set(slot.id, placed[row] - drift));
  });

  const positions = new Map<string, Point>();
  columns.forEach((column, index) => {
    for (const slot of column) {
      // Placeholders are only here to hold a lane open; there is
      // nothing to place at one.
      if (!slot.real) continue;
      positions.set(slot.id, { x: index * strideX, y: y.get(slot.id) ?? 0 });
    }
  });

  const centre = mean([...positions.values()].map((point) => point.y));
  for (const [id, point] of positions) {
    positions.set(id, { x: point.x, y: point.y - centre });
  }

  return positions;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
