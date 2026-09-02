import type { Edge, Node } from "@xyflow/react";
import type { GraphNode } from "@/domain/graph/types";
import type { EdgeRoute } from "@/domain/graph/edge-route";
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
  /**
   * Set on the canvas that shows every story at once, where a node is
   * something to read rather than somewhere to work: the controls that
   * write to one story (branching, in particular) are left off, because
   * that canvas draws each story in a lane of its own and cannot answer
   * for where a new node would land.
   */
  readOnly?: boolean;
} & Record<string, unknown>;
export type FlowNode = Node<FlowNodeData>;

/**
 * Edge presentation state, likewise derived per render rather than
 * stored:
 *   - `live`    the source has energy to give (Start, or a Done task),
 *               so the conduit is lit and carries drifting sparks
 *   - `waiting` the target can't accept it yet (Blocked), so this is
 *               the boundary the energised part of the graph stops at
 *   - `surgeId` a one-shot propagation just fired along this edge; the
 *               changing number is what replays the animation
 *   - `hovered` the pointer is on this connection, so its controls show
 *   - `route`   whether this one is drawn between its two ends or taken
 *               around the outside of the graph, and at what height —
 *               see routeEdges. Undefined on a canvas that does not
 *               compute one, which draws every edge directly.
 */
export type FlowEdgeData = {
  live: boolean;
  waiting: boolean;
  surgeId: number | null;
  hovered?: boolean;
  route?: EdgeRoute;
} & Record<string, unknown>;
export type FlowEdge = Edge<FlowEdgeData>;
