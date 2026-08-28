import { validateConnection } from "@/domain/graph/connection";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";

function node(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    storyId: "story-1",
    type: "TASK",
    title: overrides.id,
    description: null,
    status: "READY",
    assigneeId: null,
    priority: null,
    dueDate: null,
    positionX: 0,
    positionY: 0,
    sortOrder: null,
    ...overrides,
  };
}

function edge(sourceNodeId: string, targetNodeId: string): GraphEdge {
  return { id: `${sourceNodeId}-${targetNodeId}`, storyId: "story-1", sourceNodeId, targetNodeId };
}

describe("validateConnection", () => {
  const start = node({ id: "START", type: "START", status: null });
  const goal = node({ id: "GOAL", type: "GOAL", status: null });
  const a = node({ id: "A" });
  const b = node({ id: "B" });
  const c = node({ id: "C" });
  const nodes = [start, goal, a, b, c];

  it("rejects a connection when a node does not exist", () => {
    const result = validateConnection("A", "missing", nodes, []);
    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "NODE_NOT_FOUND" }),
    });
  });

  it("rejects a self-edge", () => {
    const result = validateConnection("A", "A", nodes, []);
    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
    });
  });

  it("rejects an edge into START", () => {
    const result = validateConnection("A", "START", nodes, []);
    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "INVALID_START_EDGE" }),
    });
  });

  it("rejects an edge out of GOAL", () => {
    const result = validateConnection("GOAL", "A", nodes, []);
    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "INVALID_GOAL_EDGE" }),
    });
  });

  it("rejects a duplicate edge", () => {
    const edges = [edge("A", "B")];
    const result = validateConnection("A", "B", nodes, edges);
    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "EDGE_ALREADY_EXISTS" }),
    });
  });

  it("rejects a connection that would create a cycle", () => {
    const edges = [edge("A", "B"), edge("B", "C")];
    const result = validateConnection("C", "A", nodes, edges);
    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "GRAPH_CYCLE_DETECTED" }),
    });
  });

  it("allows a valid connection", () => {
    const edges = [edge("A", "B")];
    expect(validateConnection("A", "C", nodes, edges)).toEqual({ valid: true });
  });
});
