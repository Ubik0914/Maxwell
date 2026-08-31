import {
  LANE_GAP,
  LANE_LABEL_HEIGHT,
  layoutLanes,
} from "@/domain/graph/lanes";
import { DEFAULT_LAYOUT } from "@/domain/graph/layout";
import type { GraphNode } from "@/domain/graph/types";

function node(
  id: string,
  storyId: string,
  positionX: number,
  positionY: number,
): GraphNode {
  return {
    id,
    storyId,
    type: "TASK",
    title: id,
    description: null,
    status: "READY",
    assigneeId: null,
    priority: null,
    dueDate: null,
    positionX,
    positionY,
    sortOrder: null,
  };
}

describe("layoutLanes", () => {
  it("puts a lone story's own arrangement at the origin, under its label", () => {
    const { positions, lanes } = layoutLanes(
      ["s1"],
      [node("a", "s1", 100, 300), node("b", "s1", 380, 420)],
    );

    expect(positions.get("a")).toEqual({ x: 0, y: LANE_LABEL_HEIGHT });
    expect(positions.get("b")).toEqual({ x: 280, y: LANE_LABEL_HEIGHT + 120 });
    expect(lanes).toEqual([
      {
        storyId: "s1",
        top: 0,
        height: LANE_LABEL_HEIGHT + 120 + DEFAULT_LAYOUT.nodeHeight,
      },
    ]);
  });

  it("stacks the next story below the last, whatever their raw coordinates were", () => {
    const { positions, lanes } = layoutLanes(
      ["s1", "s2"],
      [
        node("a", "s1", 100, 300),
        // The same coordinates as the first story: without lanes these
        // two would be drawn on top of each other.
        node("b", "s2", 100, 300),
      ],
    );

    const first = lanes[0];
    expect(positions.get("a")).toEqual({ x: 0, y: LANE_LABEL_HEIGHT });
    expect(positions.get("b")).toEqual({
      x: 0,
      y: first.height + LANE_GAP + LANE_LABEL_HEIGHT,
    });
    expect(lanes[1].top).toBe(first.height + LANE_GAP);
  });

  it("keeps the order it was given, not the order the nodes arrive in", () => {
    const { lanes } = layoutLanes(
      ["s2", "s1"],
      [node("a", "s1", 0, 0), node("b", "s2", 0, 0)],
    );

    expect(lanes.map((lane) => lane.storyId)).toEqual(["s2", "s1"]);
  });

  it("still gives a story with no nodes a lane of its own", () => {
    const { lanes } = layoutLanes(["empty"], []);

    expect(lanes).toEqual([
      { storyId: "empty", top: 0, height: LANE_LABEL_HEIGHT },
    ]);
  });

  it("ignores a node belonging to no listed story", () => {
    const { positions } = layoutLanes(["s1"], [node("stray", "s9", 0, 0)]);

    expect(positions.size).toBe(0);
  });
});
