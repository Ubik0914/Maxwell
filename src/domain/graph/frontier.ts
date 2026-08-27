import type { GraphNode } from "@/domain/graph/types";

/**
 * The Current Frontier is the set of TASK nodes actively being worked
 * toward the Goal right now: READY (available to start) + IN_PROGRESS
 * (already being worked on). It reads directly off each node's stored
 * status — recomputing status from dependencies is the Status Engine's
 * job (Phase 14), not this function's.
 */
export function getCurrentFrontier(nodes: GraphNode[]): GraphNode[] {
  return nodes.filter(
    (node) =>
      node.type === "TASK" &&
      (node.status === "READY" || node.status === "IN_PROGRESS"),
  );
}
