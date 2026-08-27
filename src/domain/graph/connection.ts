import type { GraphNode, GraphEdge } from "@/domain/graph/types";
import { wouldCreateCycle } from "@/domain/graph/cycle";

export interface ValidationError {
  code:
    | "NODE_NOT_FOUND"
    | "VALIDATION_ERROR"
    | "INVALID_START_EDGE"
    | "INVALID_GOAL_EDGE"
    | "EDGE_ALREADY_EXISTS"
    | "GRAPH_CYCLE_DETECTED";
  message: string;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: ValidationError };

/**
 * Validates a proposed sourceId -> targetId edge against the DAG rules
 * (Section 30): both nodes exist, no self-edge, nothing may connect
 * into START, GOAL may not connect out, no duplicate edge, no cycle.
 * `nodes`/`edges` are expected to already be scoped to one story, so a
 * cross-story id simply falls through as NODE_NOT_FOUND.
 */
export function validateConnection(
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
        message: "A task cannot connect to itself.",
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

  if (sourceNode.type === "GOAL") {
    return {
      valid: false,
      error: {
        code: "INVALID_GOAL_EDGE",
        message: "GOAL cannot connect to anything else.",
      },
    };
  }

  const isDuplicate = edges.some(
    (edge) =>
      edge.sourceNodeId === sourceId && edge.targetNodeId === targetId,
  );
  if (isDuplicate) {
    return {
      valid: false,
      error: {
        code: "EDGE_ALREADY_EXISTS",
        message: "This connection already exists.",
      },
    };
  }

  if (wouldCreateCycle(sourceId, targetId, edges)) {
    return {
      valid: false,
      error: {
        code: "GRAPH_CYCLE_DETECTED",
        message: "This connection would create a cycle.",
      },
    };
  }

  return { valid: true };
}
