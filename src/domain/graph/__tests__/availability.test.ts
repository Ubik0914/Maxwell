import { calculateTaskAvailability } from "@/domain/graph/availability";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";

function node(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    storyId: "story-1",
    type: "TASK",
    title: overrides.id,
    description: null,
    status: null,
    assigneeId: null,
    priority: null,
    dueDate: null,
    positionX: 0,
    positionY: 0,
    ...overrides,
  };
}

function edge(sourceNodeId: string, targetNodeId: string): GraphEdge {
  return { id: `${sourceNodeId}-${targetNodeId}`, storyId: "story-1", sourceNodeId, targetNodeId };
}

describe("calculateTaskAvailability", () => {
  it("is READY when the only incoming source is START", () => {
    const nodes = [
      node({ id: "START", type: "START", status: null }),
      node({ id: "A", status: "READY" }),
    ];
    const edges = [edge("START", "A")];

    expect(calculateTaskAvailability("A", nodes, edges)).toBe("READY");
  });

  it("is BLOCKED when a READY (not DONE) task feeds it", () => {
    const nodes = [
      node({ id: "A", status: "READY" }),
      node({ id: "B", status: "BLOCKED" }),
    ];
    const edges = [edge("A", "B")];

    expect(calculateTaskAvailability("B", nodes, edges)).toBe("BLOCKED");
  });

  it("is READY once the upstream task is DONE", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "B", status: "BLOCKED" }),
    ];
    const edges = [edge("A", "B")];

    expect(calculateTaskAvailability("B", nodes, edges)).toBe("READY");
  });

  it("treats a CANCELLED source as never satisfied", () => {
    const nodes = [
      node({ id: "A", status: "CANCELLED" }),
      node({ id: "B", status: "BLOCKED" }),
    ];
    const edges = [edge("A", "B")];

    expect(calculateTaskAvailability("B", nodes, edges)).toBe("BLOCKED");
  });

  it("is READY when a task has no incoming edges at all", () => {
    const nodes = [node({ id: "A", status: "READY" })];
    expect(calculateTaskAvailability("A", nodes, [])).toBe("READY");
  });

  it("requires every incoming source to be satisfied", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "B", status: "READY" }),
      node({ id: "C", status: "BLOCKED" }),
    ];
    const edges = [edge("A", "C"), edge("B", "C")];

    expect(calculateTaskAvailability("C", nodes, edges)).toBe("BLOCKED");
  });
});
