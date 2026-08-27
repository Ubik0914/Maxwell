import type { GraphNode, GraphEdge } from "@/domain/graph/types";

/**
 * The dependency-derived availability of a TASK node: READY if it has
 * no incoming edges, or every incoming source is satisfied (START is
 * always satisfied; any other node type/status must be DONE —
 * CANCELLED is never treated as satisfied, per spec). Otherwise
 * BLOCKED. This only applies to nodes currently in READY/BLOCKED —
 * a node the user moved to IN_PROGRESS/DONE/CANCELLED is a manual
 * state the caller should leave alone.
 */
export function calculateTaskAvailability(
  nodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): "READY" | "BLOCKED" {
  const incomingEdges = edges.filter((edge) => edge.targetNodeId === nodeId);
  if (incomingEdges.length === 0) return "READY";

  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const allSatisfied = incomingEdges.every((edge) => {
    const source = nodesById.get(edge.sourceNodeId);
    if (!source) return false;
    if (source.type === "START") return true;
    return source.status === "DONE";
  });

  return allSatisfied ? "READY" : "BLOCKED";
}
