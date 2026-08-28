import { reorderWithin } from "@/domain/graph/reorder";
import type { GraphNode } from "@/domain/graph/types";

function node(id: string): GraphNode {
  return {
    id,
    storyId: "story-1",
    type: "TASK",
    title: id,
    description: null,
    status: null,
    assigneeId: null,
    priority: null,
    dueDate: null,
    positionX: 0,
    positionY: 0,
    sortOrder: null,
  };
}

const A = node("a");
const B = node("b");
const C = node("c");
const D = node("d");
const ALL = [A, B, C, D];

describe("reorderWithin", () => {
  it("moves a task earlier in a full-story view", () => {
    expect(reorderWithin(ALL, ALL, "d", 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a task later in a full-story view", () => {
    // Index counts without the moved task, so 2 is "after b and c".
    expect(reorderWithin(ALL, ALL, "a", 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a task to the very front", () => {
    expect(reorderWithin(ALL, ALL, "c", 0)).toEqual(["c", "a", "b", "d"]);
  });

  it("moves a task to the very end", () => {
    expect(reorderWithin(ALL, ALL, "a", 3)).toEqual(["b", "c", "d", "a"]);
  });

  it("leaves the order alone when a task is dropped back where it was", () => {
    expect(reorderWithin(ALL, ALL, "b", 1)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps every task exactly once", () => {
    const result = reorderWithin(ALL, ALL, "b", 3);
    expect([...result].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("places a task relative to what is visible, not to the whole story", () => {
    // A filtered view showing only a and c. Dropping d before c must
    // land it after a and before c in the full order — b, which is
    // hidden, keeps its place.
    const visible = [A, C];
    expect(reorderWithin(ALL, visible, "d", 1)).toEqual(["a", "b", "d", "c"]);
  });

  it("puts a task dropped past the end of a view after that view's last", () => {
    // Dropped at the bottom of a column holding only a and b: it goes
    // after b, not after every task in the story.
    const visible = [A, B];
    expect(reorderWithin(ALL, visible, "d", 5)).toEqual(["a", "b", "d", "c"]);
  });

  it("appends when the view it was dropped into is empty", () => {
    expect(reorderWithin(ALL, [], "a", 0)).toEqual(["b", "c", "d", "a"]);
  });

  it("handles a view whose only task is the one being moved", () => {
    expect(reorderWithin(ALL, [C], "c", 0)).toEqual(["a", "b", "d", "c"]);
  });

  it("mutates neither argument", () => {
    const ordered = [...ALL];
    const visible = [A, C];
    reorderWithin(ordered, visible, "d", 1);
    expect(ordered.map((n) => n.id)).toEqual(["a", "b", "c", "d"]);
    expect(visible.map((n) => n.id)).toEqual(["a", "c"]);
  });
});
