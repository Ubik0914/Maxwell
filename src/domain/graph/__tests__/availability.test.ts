import {
  calculateTaskAvailability,
  recalculateDownstream,
} from "@/domain/graph/availability";
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

describe("recalculateDownstream", () => {
  it("demotes a DONE task back to BLOCKED once its source is no longer DONE", () => {
    // The exact shape reported live: B was DONE (presumably reached
    // while A was DONE), then A got manually reverted to READY - B
    // must not stay DONE with an unmet prerequisite.
    const nodes = [
      node({ id: "A", status: "READY" }),
      node({ id: "B", status: "DONE" }),
    ];
    const edges = [edge("A", "B")];

    const affected = recalculateDownstream("A", nodes, edges);

    expect(affected).toEqual([expect.objectContaining({ id: "B", status: "BLOCKED" })]);
  });

  it("cascades a demotion through a chain of previously-DONE tasks", () => {
    const nodes = [
      node({ id: "A", status: "READY" }),
      node({ id: "B", status: "DONE" }),
      node({ id: "C", status: "DONE" }),
    ];
    const edges = [edge("A", "B"), edge("B", "C")];

    const affected = recalculateDownstream("A", nodes, edges);

    expect(affected.map((n) => [n.id, n.status])).toEqual([
      ["B", "BLOCKED"],
      ["C", "BLOCKED"],
    ]);
  });

  it("promotes a direct BLOCKED child to READY once its source becomes DONE", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "B", status: "BLOCKED" }),
    ];
    const edges = [edge("A", "B")];

    const affected = recalculateDownstream("A", nodes, edges);

    expect(affected).toEqual([expect.objectContaining({ id: "B", status: "READY" })]);
  });

  it("leaves an IN_PROGRESS/DONE task alone when it is still satisfied", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "B", status: "IN_PROGRESS" }),
    ];
    const edges = [edge("A", "B")];

    expect(recalculateDownstream("A", nodes, edges)).toEqual([]);
  });

  it("does not cascade past a promoted READY/BLOCKED child (only a DONE->BLOCKED demotion re-queues children)", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "B", status: "BLOCKED" }),
      node({ id: "C", status: "DONE" }),
    ];
    const edges = [edge("A", "B"), edge("B", "C")];

    // B promotes BLOCKED -> READY, which never satisfies anything (only
    // DONE does), so C is intentionally left out of this pass. Whether
    // C's initial DONE is itself stale is a pre-existing state this
    // specific call - reacting only to A's change - isn't responsible
    // for reconciling.
    const affected = recalculateDownstream("A", nodes, edges);
    expect(affected).toEqual([expect.objectContaining({ id: "B", status: "READY" })]);
  });

  // Branching an edge (dag.branch_task_on_edge) leaves A->B in place and
  // adds A->N->B beside it, so B gains a second prerequisite that has
  // only just been created. The two cases below are what GraphService
  // relies on to settle the graph afterwards.
  it("blocks a target that a parallel branch gave a second, unfinished prerequisite", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "N", status: "READY" }),
      node({ id: "B", status: "READY" }),
    ];
    const edges = [edge("A", "B"), edge("A", "N"), edge("N", "B")];

    // B was READY on the strength of A alone; the new parallel path
    // means it now has to wait for N as well.
    const affected = recalculateDownstream("N", nodes, edges);

    expect(affected).toEqual([
      expect.objectContaining({ id: "B", status: "BLOCKED" }),
    ]);
  });

  it("re-opens an already-DONE target when a parallel branch is added before it", () => {
    const nodes = [
      node({ id: "A", status: "DONE" }),
      node({ id: "N", status: "READY" }),
      node({ id: "B", status: "DONE" }),
    ];
    const edges = [edge("A", "B"), edge("A", "N"), edge("N", "B")];

    const affected = recalculateDownstream("N", nodes, edges);

    expect(affected).toEqual([
      expect.objectContaining({ id: "B", status: "BLOCKED" }),
    ]);
  });
});
