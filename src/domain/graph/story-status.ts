import type { GraphNode, GraphEdge } from "@/domain/graph/types";

/**
 * The Story is COMPLETED when every source feeding into GOAL is
 * settled — DONE, or CANCELLED.
 *
 * CANCELLED counts here and nowhere else, and the difference is worth
 * stating. For an ordinary task, "the thing before me was abandoned"
 * means what it needed was never produced, so it stays BLOCKED; letting
 * cancellation satisfy a dependency would quietly unblock work whose
 * prerequisite nobody did. But GOAL produces nothing and needs nothing.
 * It is only the question "is there anything left to do?", and a
 * cancelled task is a task nobody is going to do. A story whose last
 * step was abandoned is finished — as finished as it is ever going to
 * be — and calling it ACTIVE forever means the list of live stories
 * fills up with work that has already been decided against.
 *
 * That decision is deliberately not transitive, because it doesn't need
 * to be: cancelling a task settles the path *through* it, and whatever
 * sits behind it can no longer reach GOAL by that route anyway.
 *
 * START still does NOT count as satisfied. A fresh story (START -> GOAL,
 * no tasks yet) must stay ACTIVE rather than complete itself with zero
 * work done, and since START nodes always have status = null they fall
 * out of the check below without a special case.
 *
 * This never returns ARCHIVED — callers should only apply the result
 * when the story isn't already archived.
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

  const allSettled = incomingEdges.every((edge) => {
    const status = nodesById.get(edge.sourceNodeId)?.status;
    return status === "DONE" || status === "CANCELLED";
  });

  return allSettled ? "COMPLETED" : "ACTIVE";
}
