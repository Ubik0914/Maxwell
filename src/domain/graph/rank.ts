import type { GraphEdge, GraphNode } from "@/domain/graph/types";

/**
 * The graph as the layout needs to read it: the edges that actually
 * connect two nodes that exist, and both directions of adjacency.
 *
 * Dangling edges are dropped rather than tolerated further down. A node
 * can be deleted while an edge to it is still in flight (see the
 * pending graph), and every function past this point is entitled to
 * assume that both ends of an edge are somewhere on the canvas.
 */
export interface GraphIndex {
  edges: GraphEdge[];
  successors: Map<string, string[]>;
  predecessors: Map<string, string[]>;
}

export function indexGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphIndex {
  const ids = new Set(nodes.map((node) => node.id));
  const live = edges.filter(
    (edge) => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId),
  );

  const successors = new Map<string, string[]>(
    nodes.map((node) => [node.id, []]),
  );
  const predecessors = new Map<string, string[]>(
    nodes.map((node) => [node.id, []]),
  );

  for (const edge of live) {
    successors.get(edge.sourceNodeId)!.push(edge.targetNodeId);
    predecessors.get(edge.targetNodeId)!.push(edge.sourceNodeId);
  }

  return { edges: live, successors, predecessors };
}

/**
 * Which column each node belongs in: the length of the *longest* path
 * from the start of the graph, not the shortest.
 *
 *     rank(node) = predecessors.length === 0
 *       ? 0
 *       : max(rank(predecessor)) + 1
 *
 * Put a task one step past its deepest prerequisite and every
 * dependency is guaranteed to sit strictly to its left — so no edge
 * ever doubles back, and the picture can be read as time. Shortest-path
 * layering cannot promise that: a task that waits on both START and the
 * end of a five-step chain would land in column 1, with the chain drawn
 * straight through it.
 *
 * START and GOAL are then forced to the two ends. A story's goal is
 * where it finishes even if some branch wanders past it without ever
 * connecting, and drawing it anywhere but last says the opposite.
 *
 * A cycle is impossible here — the DAG rules forbid one — but a node
 * left unvisited lands in column 0 rather than throwing. A layout
 * button must never be the thing that fails on a graph you can
 * otherwise still see.
 */
export function rankNodes(
  nodes: GraphNode[],
  { successors, predecessors }: GraphIndex,
): Map<string, number> {
  const remaining = new Map<string, number>(
    nodes.map((node) => [node.id, predecessors.get(node.id)?.length ?? 0]),
  );
  const rank = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  const queue = nodes
    .filter((node) => remaining.get(node.id) === 0)
    .map((node) => node.id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const next = (rank.get(id) ?? 0) + 1;

    for (const target of successors.get(id) ?? []) {
      if (next > (rank.get(target) ?? 0)) rank.set(target, next);
      const left = (remaining.get(target) ?? 0) - 1;
      remaining.set(target, left);
      if (left === 0) queue.push(target);
    }
  }

  const last = Math.max(0, ...rank.values());
  for (const node of nodes) {
    if (node.type === "GOAL") rank.set(node.id, last);
    if (node.type === "START") rank.set(node.id, 0);
  }

  return rank;
}

/** The ids in each rank, in the order the nodes were given. */
export function groupByRank(
  nodes: GraphNode[],
  rank: Map<string, number>,
): string[][] {
  const depth = Math.max(0, ...rank.values()) + 1;
  const ranks: string[][] = Array.from({ length: depth }, () => []);
  for (const node of nodes) ranks[rank.get(node.id) ?? 0].push(node.id);
  return ranks;
}
