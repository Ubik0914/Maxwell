import type { Node } from "@xyflow/react";
import type { GraphNode } from "@/domain/graph/types";

/**
 * React Flow requires node `data` to satisfy Record<string, unknown>.
 * This intersection keeps that requirement out of the Domain layer's
 * GraphNode type (Section 129: don't bring graph-library types into the
 * domain model) while still letting a GraphNode be passed straight
 * through as node data.
 */
export type FlowNodeData = GraphNode & Record<string, unknown>;
export type FlowNode = Node<FlowNodeData>;
