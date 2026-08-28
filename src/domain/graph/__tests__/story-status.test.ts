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
    sortOrder: null,
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

  it("is COMPLETED when the last task was CANCELLED", () => {
    // Nobody is going to do it, so there is nothing left to do. A story
    // whose final step was abandoned is as finished as it will ever be.
    const nodes = [
      node({ id: "A", status: "CANCELLED" }),
      node({ id: "GOAL", type: "GOAL", status: null }),
    ];

    expect(calculateStoryStatus(nodes, [edge("A", "GOAL")])).toBe("COMPLETED");
  });

  it("is COMPLETED on a mix of DONE and CANCELLED sources", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "B", status: "CANCELLED" }),
      node({ id: "GOAL", type: "GOAL", status: null }),
    ];
    const edges = [edge("A", "GOAL"), edge("B", "GOAL")];

    expect(calculateStoryStatus(nodes, edges)).toBe("COMPLETED");
  });

  it("stays ACTIVE when a source beside a cancelled one is still live", () => {
    const nodes = [
      node({ id: "A", status: "CANCELLED" }),
      node({ id: "B", status: "IN_PROGRESS" }),
      node({ id: "GOAL", type: "GOAL", status: null }),
    ];
    const edges = [edge("A", "GOAL"), edge("B", "GOAL")];

    expect(calculateStoryStatus(nodes, edges)).toBe("ACTIVE");
  });

  it("ignores what sits behind a cancelled source", () => {
    // The path through A is settled, so B can no longer reach GOAL by
    // that route and its own state is beside the point.
    const nodes = [
      node({ id: "B", status: "BLOCKED" }),
      node({ id: "A", status: "CANCELLED" }),
      node({ id: "GOAL", type: "GOAL", status: null }),
    ];
    const edges = [edge("B", "A"), edge("A", "GOAL")];

    expect(calculateStoryStatus(nodes, edges)).toBe("COMPLETED");
  });

  it("does not let cancellation satisfy an ordinary task's dependency", () => {
    // The GOAL rule is GOAL's alone: a cancelled prerequisite still
    // blocks real work, because what it was supposed to produce never
    // got produced. (calculateTaskAvailability owns that; this is here
    // so the two rules are read side by side.)
    const nodes = [
      node({ id: "A", status: "CANCELLED" }),
      node({ id: "B", status: "BLOCKED" }),
      node({ id: "GOAL", type: "GOAL", status: null }),
    ];
    const edges = [edge("A", "B"), edge("B", "GOAL")];

    expect(calculateStoryStatus(nodes, edges)).toBe("ACTIVE");
  });
});
