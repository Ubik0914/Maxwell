import {
  OUTER_STUB,
  outerRoutePoints,
  routeEdges,
} from "@/domain/graph/edge-route";
import { DEFAULT_LAYOUT } from "@/domain/graph/layout-options";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";

const { nodeWidth, nodeHeight } = DEFAULT_LAYOUT;
const STRIDE_X = nodeWidth + DEFAULT_LAYOUT.gapX;
const STRIDE_Y = nodeHeight + DEFAULT_LAYOUT.gapY;

function node(
  id: string,
  column: number,
  row: number,
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
    positionY: row * STRIDE_Y,
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
 * The shape a story of twenty books takes: everything starts at once,
 * everything ends at the goal, and one of them comes in two volumes so
 * the goal is two columns further along than most of the books are.
 *
 *   START ─┬─ book 1 ────────────────┐
 *          ├─ book 2 ────────────────┤
 *          ├─ …                      ├─ GOAL
 *          └─ vol 1 ─── vol 2 ───────┘
 *
 * Every book-to-goal edge spans two ranks. There is nothing in the way
 * of any of them: the middle column holds one task, and it is not on
 * their row.
 */
const READING_PILE = (() => {
  const books = Array.from({ length: 8 }, (_, at) => `book${at}`);
  return {
    nodes: [
      node("START", 0, 0, "START"),
      ...books.map((id, at) => node(id, 1, at - 4)),
      node("vol1", 1, 4),
      node("vol2", 2, 4),
      node("GOAL", 3, 0, "GOAL"),
    ],
    edges: [
      ...books.flatMap((id) => [edge("START", id), edge(id, "GOAL")]),
      edge("START", "vol1"),
      edge("vol1", "vol2"),
      edge("vol2", "GOAL"),
    ],
  };
})();

describe("a way through", () => {
  const routes = routeEdges(READING_PILE.nodes, READING_PILE.edges);

  it("keeps a long edge in the picture when nothing is in its way", () => {
    for (let at = 0; at < 8; at += 1) {
      expect(routes.get(`book${at}-GOAL`)!.kind).toBe("direct");
    }
  });

  it("turns everything arriving at one task in the same place", () => {
    // Which is what makes eight lines into GOAL one trunk rather than
    // eight separate detours — the thing that used to blow the picture
    // out sideways.
    const corners = new Set(
      Array.from({ length: 8 }, (_, at) => {
        const route = routes.get(`book${at}-GOAL`)!;
        return route.kind === "direct" ? route.centerX : undefined;
      }),
    );

    expect(corners.size).toBe(1);
    expect([...corners][0]).toBeDefined();
  });

  it("turns in the gap between two columns, never inside one", () => {
    const route = routes.get("book0-GOAL")!;
    expect(route.kind).toBe("direct");
    if (route.kind !== "direct") return;

    for (const one of READING_PILE.nodes) {
      const inside =
        route.centerX! > one.positionX &&
        route.centerX! < one.positionX + nodeWidth;
      expect(inside).toBe(false);
    }
  });

  it("sends nothing around the outside when it does not have to", () => {
    for (const route of routes.values()) expect(route.kind).toBe("direct");
  });
});

/**
 * The same story with the middle column filled in: every row a long
 * edge could have used is taken.
 *
 *   START ─┬─ up ──── wallA ──┐
 *          ├─ mid ─── wallB ──┼─ GOAL
 *          └─ down ── wallC ──┘
 *
 * `up -> GOAL` and `down -> GOAL` have nowhere to slip through: their
 * own row is blocked in the middle column, and so is the goal's.
 */
const WALLED = {
  nodes: [
    node("START", 0, 0, "START"),
    node("up", 1, -2),
    node("mid", 1, 0),
    node("down", 1, 2),
    node("wallA", 2, -2),
    node("wallB", 2, 0),
    node("wallC", 2, 2),
    // A second thing off the middle, so the busiest row is also the
    // central one and the spine runs where it looks like it runs.
    node("note", 2, 1),
    node("GOAL", 3, 0, "GOAL"),
  ],
  edges: [
    edge("START", "up"),
    edge("START", "mid"),
    edge("START", "down"),
    edge("up", "wallA"),
    edge("mid", "wallB"),
    edge("mid", "note"),
    edge("down", "wallC"),
    edge("wallA", "GOAL"),
    edge("wallB", "GOAL"),
    edge("wallC", "GOAL"),
    edge("note", "GOAL"),
    edge("up", "GOAL"),
    edge("down", "GOAL"),
  ],
};

describe("no way through", () => {
  const routes = routeEdges(WALLED.nodes, WALLED.edges);

  it("takes the line around the outside", () => {
    expect(routes.get("up-GOAL")!.kind).toBe("outer");
    expect(routes.get("down-GOAL")!.kind).toBe("outer");
  });

  it("routes each on the side its own ends are already on", () => {
    const over = routes.get("up-GOAL")!;
    const under = routes.get("down-GOAL")!;

    expect(over.kind === "outer" && over.side).toBe("above");
    expect(under.kind === "outer" && under.side).toBe("below");
  });

  it("clears every node, so no lane is drawn through a box", () => {
    for (const route of routes.values()) {
      if (route.kind !== "outer") continue;
      for (const one of WALLED.nodes) {
        const inside =
          route.laneY > one.positionY &&
          route.laneY < one.positionY + nodeHeight;
        expect(inside).toBe(false);
      }
    }
  });

  it("still draws every hop to the next column between its own ends", () => {
    for (const id of ["START-up", "up-wallA", "wallA-GOAL", "mid-wallB"]) {
      expect(routes.get(id)!.kind).toBe("direct");
    }
  });

  it("gives two long edges that overlap a lane each", () => {
    // A second blocked row above the first: both reach the goal from
    // column 1, so their spans overlap the whole way and they cannot
    // share a lane without being drawn on top of each other.
    const nodes = [
      ...WALLED.nodes,
      node("up2", 1, -4),
      node("wallD", 2, -4),
    ];
    const edges = [
      ...WALLED.edges,
      edge("START", "up2"),
      edge("up2", "wallD"),
      edge("wallD", "GOAL"),
      edge("up2", "GOAL"),
    ];

    const stacked = routeEdges(nodes, edges);
    const first = stacked.get("up-GOAL")!;
    const second = stacked.get("up2-GOAL")!;

    expect(first.kind).toBe("outer");
    expect(second.kind).toBe("outer");
    if (first.kind !== "outer" || second.kind !== "outer") return;
    expect(first.side).toBe(second.side);
    expect(first.laneY).not.toBe(second.laneY);
  });

  it("lets two long edges that never overlap share one lane", () => {
    // Two spans, one early and one late, with nothing in common. A lane
    // apiece would push the second further from the graph than it has
    // any reason to be.
    const wall = ["w1", "w2", "w3", "w4", "w5"];
    const nodes = [
      node("START", 0, 0, "START"),
      ...["m1", "m2", "m3", "m4", "m5"].map((id, at) => node(id, at + 1, 0)),
      ...wall.map((id, at) => node(id, at + 1, -2)),
      node("GOAL", 6, 0, "GOAL"),
    ];
    const edges = [
      edge("START", "m1"),
      edge("m1", "m2"),
      edge("m2", "m3"),
      edge("m3", "m4"),
      edge("m4", "m5"),
      edge("m5", "GOAL"),
      edge("START", "w1"),
      ...wall.slice(1).map((id, at) => edge(wall[at], id)),
      edge("w5", "GOAL"),
      edge("w1", "w3"),
      edge("w3", "w5"),
    ];

    const shared = routeEdges(nodes, edges);
    const early = shared.get("w1-w3")!;
    const late = shared.get("w3-w5")!;

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
