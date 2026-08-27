import type { GraphEdge } from "@/domain/graph/types";

/**
 * Would adding sourceId -> targetId create a cycle? True exactly when
 * targetId can already reach sourceId by following existing edges (a
 * self-edge always counts as an immediate cycle).
 */
export function wouldCreateCycle(
  sourceId: string,
  targetId: string,
  edges: GraphEdge[],
): boolean {
  if (sourceId === targetId) return true;

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.sourceNodeId) ?? [];
    list.push(edge.targetNodeId);
    adjacency.set(edge.sourceNodeId, list);
  }

  const visited = new Set<string>();
  const stack = [targetId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    if (current === sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adjacency.get(current) ?? [];
    stack.push(...neighbors);
  }

  return false;
}
