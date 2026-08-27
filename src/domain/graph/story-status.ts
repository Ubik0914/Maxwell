import type { GraphNode, GraphEdge } from "@/domain/graph/types";

/**
 * The Story is COMPLETED when every source feeding into GOAL is DONE,
 * otherwise ACTIVE. Unlike task availability, START does NOT count as
 * satisfied here: a fresh Story (START -> GOAL, no tasks yet) must stay
 * ACTIVE rather than complete itself with zero work done. Because START
 * nodes always have status = null, `source.status === "DONE"` already
 * excludes them without a special case. CANCELLED is likewise never
 * satisfied. This never returns ARCHIVED — callers should only apply
 * the result when the story isn't already archived.
 */
export function calculateStoryStatus(
  nodes: GraphNode[],
  edges: GraphEdge[],
): "ACTIVE" | "COMPLETED" {
  const goalNode = nodes.find((node) => node.type === "GOAL");
  if (!goalNode) return "ACTIVE";

  const incomingEdges = edges.filter(
    (edge) => edge.targetNodeId === goalNode.id,
  );
  if (incomingEdges.length === 0) return "ACTIVE";

  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const allSatisfied = incomingEdges.every((edge) => {
    const source = nodesById.get(edge.sourceNodeId);
    return source?.status === "DONE";
  });

  return allSatisfied ? "COMPLETED" : "ACTIVE";
}
