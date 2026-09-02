import {
  OUTER_STUB,
  outerRoutePoints,
  routeEdges,
} from "@/domain/graph/edge-route";
import { DEFAULT_LAYOUT } from "@/domain/graph/layout-options";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";

const { nodeWidth, nodeHeight } = DEFAULT_LAYOUT;
const STRIDE_X = nodeWidth + DEFAULT_LAYOUT.gapX;

function node(
  id: string,
  column: number,
  y: number,
  type: GraphNode["type"] = "TASK",
): GraphNode {
  return {
    id,
    storyId: "story-1",
    type,
    title: id,
    description: null,
    status: null,
    assigneeId: null,
    priority: null,
    dueDate: null,
    positionX: column * STRIDE_X,
    positionY: y,
    sortOrder: null,
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

/**
 * A spine four columns long, with one task above it and one below,
 * each reaching all the way to the goal.
 *
 *   above  ------------------------\
 *   START --- m1 --- m2 --- m3 --- GOAL
 *   below  ------------------------/
 */
const STORY = {
  nodes: [
    node("START", 0, 0, "START"),
    node("above", 1, -400),
    node("below", 1, 400),
    node("m1", 1, 0),
    node("m2", 2, 0),
    node("m3", 3, 0),
    node("GOAL", 4, 0, "GOAL"),
  ],
  edges: [
    edge("START", "above"),
    edge("START", "below"),
    edge("START", "m1"),
    edge("m1", "m2"),
    edge("m2", "m3"),
    edge("m3", "GOAL"),
    edge("above", "GOAL"),
    edge("below", "GOAL"),
  ],
};

describe("routeEdges", () => {
  const routes = routeEdges(STORY.nodes, STORY.edges);

  it("draws a hop to the next column between its own two ends", () => {
    for (const id of ["START-m1", "m1-m2", "m2-m3", "m3-GOAL"]) {
      expect(routes.get(id)!.kind).toBe("direct");
    }
  });

  it("takes anything spanning two columns or more around the outside", () => {
    expect(routes.get("above-GOAL")!.kind).toBe("outer");
    expect(routes.get("below-GOAL")!.kind).toBe("outer");
  });

  it("routes each one on the side its own ends are already on", () => {
    const over = routes.get("above-GOAL")!;
    const under = routes.get("below-GOAL")!;

    expect(over.kind === "outer" && over.side).toBe("above");
    expect(under.kind === "outer" && under.side).toBe("below");
  });

  it("clears every node, so no lane is drawn through a box", () => {
    for (const route of routes.values()) {
      if (route.kind !== "outer") continue;
      for (const graphNode of STORY.nodes) {
        const inside =
          route.laneY > graphNode.positionY &&
          route.laneY < graphNode.positionY + nodeHeight;
        expect(inside).toBe(false);
      }
    }
  });

  it("gives two long edges that overlap a lane each", () => {
    // Both reach the goal from column 1, so their spans overlap the
    // whole way. On the same side they would be drawn on top of each
    // other; stacked, the longer one goes outside the shorter.
    const nodes = [
      ...STORY.nodes,
      node("also-above", 1, -560),
      node("nearly", 2, -400),
    ];
    const edges = [
      ...STORY.edges,
      edge("START", "also-above"),
      edge("also-above", "GOAL"),
      edge("above", "nearly"),
    ];

    const stacked = routeEdges(nodes, edges);
    const first = stacked.get("above-GOAL")!;
    const second = stacked.get("also-above-GOAL")!;

    expect(first.kind).toBe("outer");
    expect(second.kind).toBe("outer");
    if (first.kind !== "outer" || second.kind !== "outer") return;
    expect(first.side).toBe(second.side);
    expect(first.laneY).not.toBe(second.laneY);
  });

  it("lets two long edges that never overlap share one lane", () => {
    // Two spans, one early and one late, with nothing in common. A lane
    // apiece would push the second one further from the graph than it
    // has any reason to be.
    const nodes = [
      node("START", 0, 0, "START"),
      node("a", 1, -300),
      node("b", 2, -300),
      node("c", 3, -300),
      node("d", 4, -300),
      node("e", 5, -300),
      node("GOAL", 6, 0, "GOAL"),
    ];
    const edges = [
      edge("START", "a"),
      edge("a", "b"),
      edge("b", "c"),
      edge("c", "d"),
      edge("d", "e"),
      edge("e", "GOAL"),
      edge("a", "c"),
      edge("c", "e"),
    ];

    const shared = routeEdges(nodes, edges);
    const early = shared.get("a-c")!;
    const late = shared.get("c-e")!;

    expect(early.kind).toBe("outer");
    expect(late.kind).toBe("outer");
    if (early.kind !== "outer" || late.kind !== "outer") return;
    expect(early.laneY).toBe(late.laneY);
  });

  it("says nothing about an edge whose ends are not both there", () => {
    const routes = routeEdges(
      [node("START", 0, 0, "START")],
      [edge("START", "gone")],
    );
    expect(routes.size).toBe(0);
  });
});

describe("outerRoutePoints", () => {
  const source = { x: 100, y: 0 };
  const target = { x: 900, y: 40 };
  const points = outerRoutePoints(source, target, -300);

  it("leaves and arrives level, and runs the lane in between", () => {
    expect(points[0]).toEqual(source);
    expect(points[points.length - 1]).toEqual(target);
    expect(points[1]).toEqual({ x: 100 + OUTER_STUB, y: 0 });
    expect(points[2]).toEqual({ x: 100 + OUTER_STUB, y: -300 });
    expect(points[3]).toEqual({ x: 900 - OUTER_STUB, y: -300 });
    expect(points[4]).toEqual({ x: 900 - OUTER_STUB, y: 40 });
  });

  it("only ever goes across or up and down", () => {
    for (let at = 1; at < points.length; at += 1) {
      const from = points[at - 1];
      const to = points[at];
      expect(from.x === to.x || from.y === to.y).toBe(true);
    }
  });

  it("shortens the stub rather than doubling back on a narrow span", () => {
    const tight = outerRoutePoints({ x: 0, y: 0 }, { x: 20, y: 0 }, -100);
    for (let at = 1; at < tight.length; at += 1) {
      expect(tight[at].x).toBeGreaterThanOrEqual(tight[at - 1].x);
    }
  });
});
