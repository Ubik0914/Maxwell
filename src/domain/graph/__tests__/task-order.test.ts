import { compareByUrgency, sortTasks } from "@/domain/graph/task-order";
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
    ...overrides,
  };
}

function order(nodes: GraphNode[], key: Parameters<typeof sortTasks>[1]) {
  return sortTasks(nodes, key).map((n) => n.id);
}

describe("compareByUrgency", () => {
  it("puts started work first and blocked work last", () => {
    const nodes = [
      node({ id: "done", status: "DONE" }),
      node({ id: "blocked", status: "BLOCKED" }),
      node({ id: "cancelled", status: "CANCELLED" }),
      node({ id: "ready", status: "READY" }),
      node({ id: "started", status: "IN_PROGRESS" }),
    ];

    expect(order(nodes, "urgency")).toEqual([
      "started",
      "ready",
      "done",
      "cancelled",
      "blocked",
    ]);
  });

  it("ranks Urgent above Low within a status", () => {
    const nodes = [
      node({ id: "low", status: "READY", priority: 1 }),
      node({ id: "urgent", status: "READY", priority: 4 }),
      node({ id: "medium", status: "READY", priority: 2 }),
    ];

    expect(order(nodes, "urgency")).toEqual(["urgent", "medium", "low"]);
  });

  it("sinks tasks with no priority below any prioritised task", () => {
    const nodes = [
      node({ id: "none", status: "READY" }),
      node({ id: "low", status: "READY", priority: 1 }),
    ];

    expect(order(nodes, "urgency")).toEqual(["low", "none"]);
  });

  it("puts the soonest due date first and undated tasks last", () => {
    const nodes = [
      node({ id: "undated", status: "READY", priority: 2 }),
      node({ id: "later", status: "READY", priority: 2, dueDate: "2026-09-01" }),
      node({ id: "sooner", status: "READY", priority: 2, dueDate: "2026-08-01" }),
    ];

    expect(order(nodes, "urgency")).toEqual(["sooner", "later", "undated"]);
  });

  it("falls back to the title so equal tasks keep a stable order", () => {
    const nodes = [
      node({ id: "b", status: "READY", title: "Beta" }),
      node({ id: "a", status: "READY", title: "Alpha" }),
    ];

    expect(order(nodes, "urgency")).toEqual(["a", "b"]);
    // Same input in the other order must produce the same output.
    expect(order([...nodes].reverse(), "urgency")).toEqual(["a", "b"]);
  });

  it("treats a statusless node (START/GOAL) as merely available", () => {
    const nodes = [
      node({ id: "goal", type: "GOAL", status: null }),
      node({ id: "started", status: "IN_PROGRESS" }),
      node({ id: "blocked", status: "BLOCKED" }),
    ];

    expect(order(nodes, "urgency")).toEqual(["started", "goal", "blocked"]);
  });

  it("ranks blocked work below finished and abandoned work", () => {
    const nodes = [
      node({ id: "blocked", status: "BLOCKED", priority: 4 }),
      node({ id: "cancelled", status: "CANCELLED" }),
    ];

    // Even an urgent blocked task sinks: priority only breaks ties
    // within a state, and there is nothing to be done about this one.
    expect(order(nodes, "urgency")).toEqual(["cancelled", "blocked"]);
  });

  it("is a pure comparator: it never mutates its arguments", () => {
    const a = node({ id: "a", status: "READY" });
    const b = node({ id: "b", status: "DONE" });
    const before = JSON.stringify([a, b]);
    compareByUrgency(a, b);
    expect(JSON.stringify([a, b])).toEqual(before);
  });
});

describe("sortTasks", () => {
  it("returns a new array and leaves the caller's alone", () => {
    const nodes = [
      node({ id: "b", status: "DONE" }),
      node({ id: "a", status: "READY" }),
    ];

    const sorted = sortTasks(nodes, "urgency");
    expect(sorted).not.toBe(nodes);
    expect(nodes.map((n) => n.id)).toEqual(["b", "a"]);
    expect(sorted.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("sorts by title alone when asked", () => {
    const nodes = [
      node({ id: "z", status: "IN_PROGRESS", title: "Zebra" }),
      node({ id: "a", status: "DONE", title: "Aardvark" }),
    ];

    expect(order(nodes, "title")).toEqual(["a", "z"]);
  });

  it("breaks ties on every other key with the urgency order", () => {
    // Same due date, so the urgency rule (status, then priority) decides.
    const nodes = [
      node({ id: "ready", status: "READY", dueDate: "2026-08-01" }),
      node({ id: "started", status: "IN_PROGRESS", dueDate: "2026-08-01" }),
    ];

    expect(order(nodes, "due")).toEqual(["started", "ready"]);
  });

  it("orders by priority first when priority is the chosen key", () => {
    const nodes = [
      node({ id: "startedLow", status: "IN_PROGRESS", priority: 1 }),
      node({ id: "readyUrgent", status: "READY", priority: 4 }),
    ];

    expect(order(nodes, "priority")).toEqual(["readyUrgent", "startedLow"]);
    expect(order(nodes, "urgency")).toEqual(["startedLow", "readyUrgent"]);
  });
});
