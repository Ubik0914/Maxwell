export type NodeType = "START" | "TASK" | "GOAL";

export type TaskStatus =
  | "BLOCKED"
  | "READY"
  | "IN_PROGRESS"
  | "DONE"
  | "CANCELLED";

export type Priority = 1 | 2 | 3 | 4;

/**
 * The statuses a person is allowed to choose.
 *
 * BLOCKED is absent on purpose: it is derived by the Status Engine from
 * the shape of the graph, never picked. This lives here rather than
 * beside the control that renders it, because it is a rule about what a
 * task may be — the same rule validateStatusChange and the API enforce,
 * neither of which has any business importing from a component.
 */
export type SettableStatus = "READY" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export const SETTABLE_STATUSES: SettableStatus[] = [
  "READY",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
];

/**
 * Domain-level graph node. Deliberately decoupled from both the raw
 * (snake_case) DB row shape and from @xyflow/react's Node type — the
 * Repository layer maps DB rows into this, and the Graph rendering layer
 * (Phase 10) maps this into React Flow nodes.
 */
export interface GraphNode {
  id: string;
  storyId: string;
  type: NodeType;
  title: string;
  description: string | null;
  status: TaskStatus | null;
  assigneeId: string | null;
  priority: Priority | null;
  dueDate: string | null;
  positionX: number;
  positionY: number;
  /**
   * Where this task has been placed by hand within its story, or null
   * for one nobody has moved. Every other ordering in the product is
   * derived; this is the one that is simply asserted, which is why it
   * has to be stored rather than computed. See task-order's "manual".
   */
  sortOrder: number | null;
}

export interface GraphEdge {
  id: string;
  storyId: string;
  sourceNodeId: string;
  targetNodeId: string;
}
