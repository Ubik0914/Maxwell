import { buildBlockerMap } from "@/domain/graph/blockers";
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
  return {
    id: `${sourceNodeId}->${targetNodeId}`,
    storyId: "story-1",
    sourceNodeId,
    targetNodeId,
  };
}

function blockersOf(
  nodes: GraphNode[],
  edges: GraphEdge[],
  id: string,
): string[] {
  return (buildBlockerMap(nodes, edges).get(id) ?? []).map((n) => n.id);
}

describe("buildBlockerMap", () => {
  it("gives every node an entry, empty when nothing holds it up", () => {
    const nodes = [node({ id: "A" }), node({ id: "B" })];
    const map = buildBlockerMap(nodes, []);

    expect([...map.keys()].sort()).toEqual(["A", "B"]);
    expect(map.get("A")).toEqual([]);
  });

  it("lists an unfinished prerequisite", () => {
    const nodes = [
      node({ id: "A", status: "READY" }),
      node({ id: "B", status: "BLOCKED" }),
    ];

    expect(blockersOf(nodes, [edge("A", "B")], "B")).toEqual(["A"]);
  });

  it("does not list a prerequisite that is DONE", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "B", status: "READY" }),
    ];

    expect(blockersOf(nodes, [edge("A", "B")], "B")).toEqual([]);
  });

  it("never treats START as a blocker", () => {
    const nodes = [
      node({ id: "START", type: "START", status: null }),
      node({ id: "A", status: "READY" }),
    ];

    expect(blockersOf(nodes, [edge("START", "A")], "A")).toEqual([]);
  });

  it("still counts a CANCELLED prerequisite as blocking", () => {
    const nodes = [
      node({ id: "A", status: "CANCELLED" }),
      node({ id: "B", status: "BLOCKED" }),
    ];

    expect(blockersOf(nodes, [edge("A", "B")], "B")).toEqual(["A"]);
  });

  it("lists only the unsatisfied half of a multi-prerequisite task", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "B", status: "IN_PROGRESS" }),
      node({ id: "C", status: "READY" }),
      node({ id: "D", status: "BLOCKED" }),
    ];
    const edges = [edge("A", "D"), edge("B", "D"), edge("C", "D")];

    expect(blockersOf(nodes, edges, "D").sort()).toEqual(["B", "C"]);
  });

  it("ignores an edge whose source is not among the nodes", () => {
    const nodes = [node({ id: "B", status: "READY" })];

    expect(blockersOf(nodes, [edge("ghost", "B")], "B")).toEqual([]);
  });

  it("ignores an edge whose target is not among the nodes", () => {
    const nodes = [node({ id: "A", status: "READY" })];

    expect(() => buildBlockerMap(nodes, [edge("A", "ghost")])).not.toThrow();
    expect(buildBlockerMap(nodes, [edge("A", "ghost")]).has("ghost")).toBe(
      false,
    );
  });
});
