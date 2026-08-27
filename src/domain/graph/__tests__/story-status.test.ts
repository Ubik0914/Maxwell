import { calculateStoryStatus } from "@/domain/graph/story-status";
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

describe("calculateStoryStatus", () => {
  it("stays ACTIVE for a fresh story (START -> GOAL, no tasks)", () => {
    const nodes = [
      node({ id: "START", type: "START", status: null }),
      node({ id: "GOAL", type: "GOAL", status: null }),
    ];
    const edges = [edge("START", "GOAL")];

    expect(calculateStoryStatus(nodes, edges)).toBe("ACTIVE");
  });

  it("is COMPLETED when every source feeding GOAL is DONE", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "B", status: "DONE" }),
      node({ id: "GOAL", type: "GOAL", status: null }),
    ];
    const edges = [edge("A", "GOAL"), edge("B", "GOAL")];

    expect(calculateStoryStatus(nodes, edges)).toBe("COMPLETED");
  });

  it("stays ACTIVE when one source is not yet DONE", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "B", status: "READY" }),
      node({ id: "GOAL", type: "GOAL", status: null }),
    ];
    const edges = [edge("A", "GOAL"), edge("B", "GOAL")];

    expect(calculateStoryStatus(nodes, edges)).toBe("ACTIVE");
  });

  it("returns ACTIVE when there is no GOAL node", () => {
    expect(calculateStoryStatus([], [])).toBe("ACTIVE");
  });
});
