import type { GraphEdge, GraphNode } from "@/domain/graph/types";

/**
 * Changes made on screen that the database has not confirmed yet.
 *
 * Kept as a patch over the server's answer rather than as an edited
 * copy of it, because the two arrive from different directions: the
 * server's version is replaced wholesale on every refresh, and a patch
 * can simply be dropped when that happens. An edited copy would have to
 * be diffed against the new truth to work out what was still pending.
 */
export interface PendingPatch {
  added: GraphNode[];
  removedNodeIds: string[];
  addedEdges: GraphEdge[];
  removedEdgeIds: string[];
}

export const NOTHING_PENDING: PendingPatch = {
  added: [],
  removedNodeIds: [],
  addedEdges: [],
  removedEdgeIds: [],
};

/** Ids of things that only exist on screen so far. */
export function isPendingId(id: string): boolean {
  return id.startsWith("pending:");
}

export function pendingId(): string {
  return `pending:${crypto.randomUUID()}`;
}

/**
 * The story as it should be drawn right now: what the server said, plus
 * what has been asked for since.
 *
 * A removed node takes its connections with it. Leaving them would draw
 * edges to nothing for as long as the delete is in flight, and on a
 * canvas that is a line running off into empty space — worse than the
 * node still being there.
 */
export function applyPending(
  nodes: GraphNode[],
  edges: GraphEdge[],
  patch: PendingPatch,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (patch === NOTHING_PENDING) return { nodes, edges };

  const goneNodes = new Set(patch.removedNodeIds);
  const goneEdges = new Set(patch.removedEdgeIds);
  const survives = (edge: GraphEdge) =>
    !goneEdges.has(edge.id) &&
    !goneNodes.has(edge.sourceNodeId) &&
    !goneNodes.has(edge.targetNodeId);

  return {
    nodes: [
      ...nodes.filter((node) => !goneNodes.has(node.id)),
      ...patch.added.filter((node) => !goneNodes.has(node.id)),
    ],
    edges: [
      ...edges.filter(survives),
      ...patch.addedEdges.filter(survives),
    ],
  };
}

/**
 * A task that exists on screen and nowhere else yet.
 *
 * The fields it guesses are the ones the server will decide for itself
 * — an id, and a status derived from what the task is waiting on. Both
 * are replaced within a refresh, so what matters is only that they are
 * right often enough not to flicker: a task with nothing in front of it
 * is READY, and one added behind unfinished work is BLOCKED, which is
 * exactly what the Status Engine will say.
 */
export function pendingTask(input: {
  storyId: string;
  title: string;
  description?: string | null;
  status?: GraphNode["status"];
  x: number;
  y: number;
}): GraphNode {
  return {
    id: pendingId(),
    storyId: input.storyId,
    type: "TASK",
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? "READY",
    assigneeId: null,
    priority: null,
    dueDate: null,
    positionX: input.x,
    positionY: input.y,
    sortOrder: null,
  };
}
