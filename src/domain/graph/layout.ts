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

export const DEFAULT_LAYOUT: LayoutOptions = {
  nodeWidth: 170,
  nodeHeight: 64,
  gapX: 110,
  gapY: 48,
};

/** How many barycentre sweeps to run. Past a handful it stops paying. */
const SWEEPS = 4;

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

  const columns = groupByColumn(nodes, column);
  orderWithinColumns(columns, predecessors, successors);

  return toPositions(columns, options);
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

function groupByColumn(
  nodes: GraphNode[],
  column: Map<string, number>,
): GraphNode[][] {
  const width = Math.max(...column.values()) + 1;
  const columns: GraphNode[][] = Array.from({ length: width }, () => []);
  for (const node of nodes) columns[column.get(node.id) ?? 0].push(node);
  return columns;
}

/**
 * Barycentre sweeps, forward then backward, so ordering information
 * propagates from both ends of the graph rather than only from the
 * start. A node with no neighbours in the column being read from keeps
 * its current place instead of collecting at the top.
 */
function orderWithinColumns(
  columns: GraphNode[][],
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

  const sweep = (column: GraphNode[], neighbours: Map<string, string[]>) => {
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
 * Columns are centred on a shared axis rather than hung from the top,
 * so a story reads as one spine with work branching off it — and adding
 * a parallel task nudges its column apart symmetrically instead of
 * pushing the whole graph downward.
 */
function toPositions(
  columns: GraphNode[][],
  { nodeWidth, nodeHeight, gapX, gapY }: LayoutOptions,
): Map<string, Point> {
  const positions = new Map<string, Point>();
  const strideX = nodeWidth + gapX;
  const strideY = nodeHeight + gapY;

  columns.forEach((column, index) => {
    const offset = ((column.length - 1) * strideY) / 2;
    column.forEach((node, row) => {
      positions.set(node.id, {
        x: index * strideX,
        y: row * strideY - offset,
      });
    });
  });

  return positions;
}
