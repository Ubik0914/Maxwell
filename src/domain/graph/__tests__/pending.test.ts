import {
  NOTHING_PENDING,
  applyPending,
  isPendingId,
  type PendingPatch,
} from "@/domain/graph/pending";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";

function node(id: string): GraphNode {
  return {
    id,
    storyId: "s",
    type: "TASK",
    title: id,
    description: null,
    status: "READY",
    assigneeId: null,
    priority: null,
    dueDate: null,
    positionX: 0,
    positionY: 0,
    sortOrder: null,
  };
}

function edge(id: string, from: string, to: string): GraphEdge {
  return { id, storyId: "s", sourceNodeId: from, targetNodeId: to };
}

const NODES = [node("A"), node("B")];
const EDGES = [edge("e1", "A", "B")];

function patch(over: Partial<PendingPatch>): PendingPatch {
  return { ...NOTHING_PENDING, ...over };
}

describe("applyPending", () => {
  it("hands back exactly what it was given when nothing is pending", () => {
    const result = applyPending(NODES, EDGES, NOTHING_PENDING);
    expect(result.nodes).toBe(NODES);
    expect(result.edges).toBe(EDGES);
  });

  it("shows a task that has only been asked for", () => {
    const result = applyPending(
      NODES,
      EDGES,
      patch({ added: [node("pending:1")] }),
    );
    expect(result.nodes.map((n) => n.id)).toEqual(["A", "B", "pending:1"]);
  });

  it("hides a task that has only been un-asked for", () => {
    const result = applyPending(NODES, EDGES, patch({ removedNodeIds: ["B"] }));
    expect(result.nodes.map((n) => n.id)).toEqual(["A"]);
  });

  it("takes a removed task's connections with it", () => {
    // A line to a node that is no longer drawn runs off into nothing,
    // which reads worse than the node still being there.
    const result = applyPending(NODES, EDGES, patch({ removedNodeIds: ["B"] }));
    expect(result.edges).toEqual([]);
  });

  it("drops a pending edge whose end has just been removed", () => {
    const result = applyPending(
      NODES,
      EDGES,
      patch({
        addedEdges: [edge("pending:e", "A", "B")],
        removedNodeIds: ["B"],
      }),
    );
    expect(result.edges).toEqual([]);
  });

  it("hides an edge that has been un-asked for", () => {
    const result = applyPending(
      NODES,
      EDGES,
      patch({ removedEdgeIds: ["e1"] }),
    );
    expect(result.edges).toEqual([]);
    expect(result.nodes).toHaveLength(2);
  });

  it("splices: one connection out, a task and two connections in", () => {
    const inserted = node("pending:1");
    const result = applyPending(
      NODES,
      EDGES,
      patch({
        added: [inserted],
        removedEdgeIds: ["e1"],
        addedEdges: [
          edge("pending:e1", "A", "pending:1"),
          edge("pending:e2", "pending:1", "B"),
        ],
      }),
    );
    expect(result.nodes.map((n) => n.id)).toEqual(["A", "B", "pending:1"]);
    expect(result.edges.map((e) => e.id)).toEqual(["pending:e1", "pending:e2"]);
  });

  it("does not mutate what it was given", () => {
    const nodes = [...NODES];
    const edges = [...EDGES];
    applyPending(
      nodes,
      edges,
      patch({ added: [node("pending:1")], removedNodeIds: ["A"] }),
    );
    expect(nodes).toEqual(NODES);
    expect(edges).toEqual(EDGES);
  });
});

describe("isPendingId", () => {
  it("tells a placeholder from a real row", () => {
    expect(isPendingId("pending:abc")).toBe(true);
    expect(isPendingId("0f2c9a34-0000-4000-8000-000000000000")).toBe(false);
  });
});
