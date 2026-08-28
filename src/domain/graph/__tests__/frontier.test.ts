import { getCurrentFrontier } from "@/domain/graph/frontier";
import type { GraphNode } from "@/domain/graph/types";

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

describe("getCurrentFrontier", () => {
  it("includes READY and IN_PROGRESS tasks", () => {
    const nodes = [
      node({ id: "A", status: "READY" }),
      node({ id: "B", status: "IN_PROGRESS" }),
      node({ id: "C", status: "BLOCKED" }),
      node({ id: "D", status: "DONE" }),
      node({ id: "E", status: "CANCELLED" }),
    ];

    const frontier = getCurrentFrontier(nodes).map((n) => n.id);
    expect(frontier.sort()).toEqual(["A", "B"]);
  });

  it("excludes START and GOAL nodes", () => {
    const nodes = [
      node({ id: "START", type: "START", status: null }),
      node({ id: "GOAL", type: "GOAL", status: null }),
      node({ id: "A", status: "READY" }),
    ];

    const frontier = getCurrentFrontier(nodes).map((n) => n.id);
    expect(frontier).toEqual(["A"]);
  });

  it("returns an empty array when nothing is READY/IN_PROGRESS", () => {
    const nodes = [node({ id: "A", status: "BLOCKED" })];
    expect(getCurrentFrontier(nodes)).toEqual([]);
  });
});
