import type { GraphNode, GraphEdge } from "@/domain/graph/types";
import { wouldCreateCycle } from "@/domain/graph/cycle";
import type { ValidationResult } from "@/domain/graph/connection";

/**
 * Validates a proposed branch: a brand-new task inserted as
 * source -> NewTask -> target, running parallel to whatever already
 * lies between them.
 *
 * This is close to validateConnection but deliberately not the same
 * call. A branch's whole purpose is usually to run beside an existing
 * source -> target edge, so the duplicate-edge rule must NOT apply —
 * while the cycle rule still must: NewTask only passes energy through,
 * so source -> NewTask -> target closes a loop under exactly the same
 * condition a direct source -> target edge would.
 */
export function validateBranch(
  sourceId: string,
  targetId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): ValidationResult {
  const sourceNode = nodes.find((n) => n.id === sourceId);
  const targetNode = nodes.find((n) => n.id === targetId);

  if (!sourceNode || !targetNode) {
    return {
      valid: false,
      error: {
        code: "NODE_NOT_FOUND",
        message: "One of the selected tasks no longer exists.",
      },
    };
  }

  if (sourceId === targetId) {
    return {
      valid: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "A branch cannot rejoin the task it starts from.",
      },
    };
  }

  if (sourceNode.type === "GOAL") {
    return {
      valid: false,
      error: {
        code: "INVALID_GOAL_EDGE",
        message: "GOAL cannot connect to anything else.",
      },
    };
  }

  if (targetNode.type === "START") {
    return {
      valid: false,
      error: {
        code: "INVALID_START_EDGE",
        message: "Nothing can connect into START.",
      },
    };
  }

  if (wouldCreateCycle(sourceId, targetId, edges)) {
    return {
      valid: false,
      error: {
        code: "GRAPH_CYCLE_DETECTED",
        message: "This branch would create a cycle.",
      },
    };
  }

  return { valid: true };
}

/**
 * Where a new task added after `nodeId` is allowed to rejoin.
 *
 * Everything downstream of it, not only what it points at directly.
 * "Do this before what already follows" is the common case but not the
 * only one: work inserted after a task often belongs before something
 * further along the same path, and offering only the immediate
 * successors made those branches unreachable without going to the
 * canvas and drawing the edge by hand.
 *
 * Breadth-first, so the nearest tasks are named first and the order on
 * screen reads outward from the branch point rather than at random.
 * GOAL is appended when the search cannot reach it, which is what makes
 * a dead-end task still branchable: every story has a GOAL and nothing
 * leaves it, so it is always a safe landing point.
 *
 * Every option is downstream by construction, so none of them can close
 * a cycle: a path back from a descendant would already be one.
 * GraphService re-checks anyway — this list is a convenience for
 * building a picker, never an authority.
 *
 * It lives in the domain rather than beside the graph canvas because
 * the list and the board offer the same "add what comes next" action
 * and must offer the same choices — a second copy of this rule reading
 * React Flow's node type would be the same rule stated twice.
 */
export function rejoinCandidates(
  nodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const successors = new Map<string, string[]>();
  for (const edge of edges) {
    const from = successors.get(edge.sourceNodeId);
    if (from) from.push(edge.targetNodeId);
    else successors.set(edge.sourceNodeId, [edge.targetNodeId]);
  }

  const candidates: GraphNode[] = [];
  const seen = new Set([nodeId]);
  const queue = [nodeId];

  while (queue.length > 0) {
    for (const nextId of successors.get(queue.shift()!) ?? []) {
      if (seen.has(nextId)) continue;
      seen.add(nextId);
      queue.push(nextId);
      const next = byId.get(nextId);
      if (next) candidates.push(next);
    }
  }

  const goal = nodes.find((node) => node.type === "GOAL");
  if (goal && !seen.has(goal.id)) candidates.push(goal);

  return candidates;
}
