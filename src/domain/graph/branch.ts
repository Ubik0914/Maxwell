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
 * Its direct successors first — the ordinary case, "do this before what
 * already follows" — and then GOAL, which every story has and which
 * nothing leaves, so it is always a safe landing point.
 *
 * Every option is downstream of the branch point by construction, so
 * none of them can close a cycle. GraphService re-checks anyway: this
 * list is a convenience for building a picker, never an authority.
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
  const candidates: GraphNode[] = [];

  for (const edge of edges) {
    if (edge.sourceNodeId !== nodeId) continue;
    const target = byId.get(edge.targetNodeId);
    if (target && !candidates.some((c) => c.id === target.id)) {
      candidates.push(target);
    }
  }

  const goal = nodes.find((node) => node.type === "GOAL");
  if (goal && goal.id !== nodeId && !candidates.some((c) => c.id === goal.id)) {
    candidates.push(goal);
  }

  return candidates;
}
