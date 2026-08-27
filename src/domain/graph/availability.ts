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

/**
 * Re-evaluates every TASK reachable downstream of `changedNodeId` whose
 * dependency-derived state may now be stale, cascading through the full
 * transitive fan-out rather than stopping at direct children.
 *
 * A READY/BLOCKED child is a pure promotion/demotion between those two
 * states and never itself changes what's satisfied further downstream
 * (only DONE does that), so it doesn't get re-queued. A DONE/IN_PROGRESS
 * child, though, is only allowed to stay that way while its own
 * dependencies remain satisfied — if `changedNodeId` (directly) or an
 * earlier demotion in this same pass (transitively) means that's no
 * longer true, it gets forced back to BLOCKED, and *that* demotion is
 * re-queued: a grandchild that was DONE because this child used to be
 * DONE is now invalid too. This is what stops the DAG from ever holding
 * a DONE task whose own prerequisite isn't DONE (e.g. a task manually
 * skipped straight from BLOCKED to DONE, or an upstream task reverted
 * after downstream work had already completed against it).
 */
export function recalculateDownstream(
  changedNodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphNode[] {
  const workingById = new Map(nodes.map((node) => [node.id, node]));
  const outgoingByNode = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outgoingByNode.get(edge.sourceNodeId);
    if (list) {
      list.push(edge.targetNodeId);
    } else {
      outgoingByNode.set(edge.sourceNodeId, [edge.targetNodeId]);
    }
  }

  const affected: GraphNode[] = [];
  const queue = [...(outgoingByNode.get(changedNodeId) ?? [])];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const targetId = queue.shift()!;
    if (visited.has(targetId)) continue;
    visited.add(targetId);

    const target = workingById.get(targetId);
    if (!target || target.type !== "TASK") continue;

    const workingNodes = [...workingById.values()];

    if (target.status === "READY" || target.status === "BLOCKED") {
      const nextStatus = calculateTaskAvailability(
        target.id,
        workingNodes,
        edges,
      );
      if (nextStatus !== target.status) {
        const updated = { ...target, status: nextStatus };
        workingById.set(target.id, updated);
        affected.push(updated);
      }
      continue;
    }

    if (target.status === "DONE" || target.status === "IN_PROGRESS") {
      const nextAvailability = calculateTaskAvailability(
        target.id,
        workingNodes,
        edges,
      );
      if (nextAvailability === "BLOCKED") {
        const updated: GraphNode = { ...target, status: "BLOCKED" };
        workingById.set(target.id, updated);
        affected.push(updated);
        for (const nextId of outgoingByNode.get(target.id) ?? []) {
          queue.push(nextId);
        }
      }
    }
  }

  return affected;
}
