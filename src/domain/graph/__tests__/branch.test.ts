import { rejoinCandidates, validateBranch } from "@/domain/graph/branch";
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
    id: `${sourceNodeId}-${targetNodeId}`,
    storyId: "story-1",
    sourceNodeId,
    targetNodeId,
  };
}

describe("validateBranch", () => {
  const nodes = [
    node({ id: "START", type: "START" }),
    node({ id: "A", status: "READY" }),
    node({ id: "B", status: "BLOCKED" }),
    node({ id: "GOAL", type: "GOAL" }),
  ];
  const edges = [edge("START", "A"), edge("A", "B"), edge("B", "GOAL")];

  it("allows a branch running beside an edge that already exists", () => {
    // The whole point of the parallel shape: A->B stays, and the new
    // task is added as a second A->...->B path. validateConnection
    // would reject this as a duplicate, which is why branching has a
    // rule of its own.
    expect(validateBranch("A", "B", nodes, edges)).toEqual({ valid: true });
  });

  it("allows a branch that rejoins further downstream than the next task", () => {
    expect(validateBranch("A", "GOAL", nodes, edges)).toEqual({ valid: true });
  });

  it("rejects rejoining at a task that leads back to the branch point", () => {
    // A -> NewTask -> START is impossible anyway, but B -> NewTask -> A
    // is the real trap: A already reaches B, so this closes a loop.
    const result = validateBranch("B", "A", nodes, edges);

    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "GRAPH_CYCLE_DETECTED" }),
    });
  });

  it("rejects a branch that rejoins where it started", () => {
    const result = validateBranch("A", "A", nodes, edges);

    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
    });
  });

  it("rejects branching out of GOAL", () => {
    const result = validateBranch("GOAL", "A", nodes, edges);

    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "INVALID_GOAL_EDGE" }),
    });
  });

  it("rejects rejoining into START", () => {
    const result = validateBranch("A", "START", nodes, edges);

    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "INVALID_START_EDGE" }),
    });
  });

  it("rejects a node that is no longer in the graph", () => {
    const result = validateBranch("A", "gone", nodes, edges);

    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: "NODE_NOT_FOUND" }),
    });
  });
});

describe("rejoinCandidates", () => {
  const nodes = [
    node({ id: "START", type: "START" }),
    node({ id: "A", status: "DONE" }),
    node({ id: "B", status: "READY" }),
    node({ id: "C", status: "BLOCKED" }),
    node({ id: "GOAL", type: "GOAL" }),
  ];
  const edges = [
    edge("START", "A"),
    edge("A", "B"),
    edge("A", "C"),
    edge("B", "GOAL"),
  ];

  it("offers the node's own successors, then GOAL", () => {
    expect(rejoinCandidates("A", nodes, edges).map((n) => n.id)).toEqual([
      "B",
      "C",
      "GOAL",
    ]);
  });

  it("offers GOAL alone when nothing follows yet", () => {
    expect(rejoinCandidates("C", nodes, edges).map((n) => n.id)).toEqual([
      "GOAL",
    ]);
  });

  it("does not list GOAL twice when it is already a successor", () => {
    expect(rejoinCandidates("B", nodes, edges).map((n) => n.id)).toEqual([
      "GOAL",
    ]);
  });

  it("never offers the node itself", () => {
    expect(rejoinCandidates("GOAL", nodes, edges)).toEqual([]);
  });

  it("returns nothing when the story has no GOAL and no successors", () => {
    const orphan = [node({ id: "X" })];
    expect(rejoinCandidates("X", orphan, [])).toEqual([]);
  });
});
