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
