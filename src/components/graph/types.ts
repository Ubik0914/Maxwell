import type { Edge, Node } from "@xyflow/react";
import type { GraphNode } from "@/domain/graph/types";
import type { NodePulse } from "@/features/graph/hooks/useEnergyFlow";

/**
 * React Flow requires node `data` to satisfy Record<string, unknown>.
 * This intersection keeps that requirement out of the Domain layer's
 * GraphNode type (Section 129: don't bring graph-library types into the
 * domain model) while still letting a GraphNode be passed straight
 * through as node data.
 *
 * `pulse` is transient presentation state, not domain state: StoryGraph
 * injects it for the ~1s a status change is being animated and drops it
 * again, so nodes carry no animation bookkeeping of their own.
 */
export type FlowNodeData = GraphNode & {
  pulse?: NodePulse;
  /**
   * GOAL only: whether the story has actually arrived here. Derived per
   * render from the same rule that sets the story's own status, so an
   * unreached goal can be drawn dark instead of pretending to be lit.
   */
  reached?: boolean;
} & Record<string, unknown>;
export type FlowNode = Node<FlowNodeData>;

/**
 * Edge presentation state, likewise derived per render rather than
 * stored:
 *   - `live`    the source has energy to give (Start, or a Done task),
 *               so the conduit is lit and carries drifting sparks
 *   - `damped`  the target can't accept it yet (Blocked)
 *   - `surgeId` a one-shot propagation just fired along this edge; the
 *               changing number is what replays the animation
 */
export type FlowEdgeData = {
  live: boolean;
  damped: boolean;
  surgeId: number | null;
} & Record<string, unknown>;
export type FlowEdge = Edge<FlowEdgeData>;
