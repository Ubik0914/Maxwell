import type { GraphEdge, GraphNode } from "@/domain/graph/types";

/**
 * The same rule calculateTaskAvailability uses, applied to one source:
 * START is always satisfied, anything else has to be DONE. CANCELLED is
 * never satisfied — abandoning a prerequisite doesn't grant what it was
 * supposed to produce.
 */
function isSatisfied(source: GraphNode): boolean {
  return source.type === "START" || source.status === "DONE";
}

/**
 * For every node, the incoming sources that are not yet satisfied — the
 * tasks it is actually waiting on.
 *
 * This is what a list or a board would otherwise throw away. A flat list
 * can tell you a task is BLOCKED; only the DAG can tell you *by what*,
 * and that is the answer the question "why can't I start this?" wants.
 * Availability gives the verdict, this gives the reason, and both are
 * derived from the same satisfaction rule so they can never disagree.
 *
 * Every node in `nodes` gets an entry, empty when nothing is holding it
 * up, so callers can read the map without a null check.
 */
export function buildBlockerMap(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, GraphNode[]> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const blockers = new Map<string, GraphNode[]>(
    nodes.map((node) => [node.id, []]),
  );

  for (const edge of edges) {
    const waiting = blockers.get(edge.targetNodeId);
    if (!waiting) continue;

    const source = nodesById.get(edge.sourceNodeId);
    // A source that isn't in `nodes` is a dangling edge — it can't be
    // shown as a blocker, and pretending it isn't one would claim the
    // target is free when it isn't. Skipping it leaves the target's
    // stored status to speak for itself.
    if (!source || isSatisfied(source)) continue;

    waiting.push(source);
  }

  return blockers;
}
