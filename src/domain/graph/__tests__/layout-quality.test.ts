import { layoutStory } from "@/domain/graph/layout";
import { DEFAULT_LAYOUT } from "@/domain/graph/layout-options";
import { routeEdges } from "@/domain/graph/edge-route";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";

/**
 * The shapes a story actually comes in, held to the standard the
 * layout is judged by.
 *
 * These are the graphs the redesign was measured on. Against the
 * arrangement it replaced they went, respectively: 1 crossing to 0,
 * 0 to 0, 0 to 0 and 12 to 0; lines drawn over the top of a box, 0, 0,
 * 1 and 28, all to 0. The numbers themselves belong to the change that
 * made them; what belongs here is that they stay at zero.
 */

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
  return {
    id: `${sourceNodeId}-${targetNodeId}`,
    storyId: "story-1",
    sourceNodeId,
    targetNodeId,
  };
}

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Three books started at once, one running straight to the goal. */
const READING_LIST: Graph = {
  nodes: [
    node({ id: "START", type: "START" }),
    node({ id: "android" }),
    node({ id: "shoujo" }),
    node({ id: "sapiens-1" }),
    node({ id: "sapiens-2" }),
    node({ id: "homo-1" }),
    node({ id: "homo-2" }),
    node({ id: "GOAL", type: "GOAL" }),
  ],
  edges: [
    edge("START", "android"),
    edge("START", "shoujo"),
    edge("START", "sapiens-1"),
    edge("sapiens-1", "sapiens-2"),
    edge("sapiens-2", "homo-1"),
    edge("homo-1", "homo-2"),
    edge("android", "homo-2"),
    edge("shoujo", "GOAL"),
    edge("homo-2", "GOAL"),
  ],
};

/** A main line with branches off it, several of them reaching the end. */
const SPINE_WITH_BRANCHES: Graph = (() => {
  const main = ["m1", "m2", "m3", "m4", "m5"];
  const branches = ["b1", "b2", "b3", "b4"];
  return {
    nodes: [
      node({ id: "START", type: "START" }),
      ...main.map((id) => node({ id })),
      ...branches.map((id) => node({ id })),
      node({ id: "GOAL", type: "GOAL" }),
    ],
    edges: [
      edge("START", "m1"),
      ...main.slice(1).map((id, at) => edge(main[at], id)),
      edge("m5", "GOAL"),
      edge("START", "b1"),
      edge("m1", "b2"),
      edge("m2", "b3"),
      edge("m3", "b4"),
      ...branches.map((id) => edge(id, "GOAL")),
    ],
  };
})();

/** Two chains that split and join again, twice. */
const DIAMONDS: Graph = {
  nodes: [
    node({ id: "START", type: "START" }),
    ...["a1", "a2", "b1", "b2", "join1", "c1", "c2", "d1", "d2", "join2"].map(
      (id) => node({ id }),
    ),
    node({ id: "GOAL", type: "GOAL" }),
  ],
  edges: [
    edge("START", "a1"),
    edge("START", "b1"),
    edge("a1", "a2"),
    edge("b1", "b2"),
    edge("a2", "join1"),
    edge("b2", "join1"),
    edge("join1", "c1"),
    edge("join1", "d1"),
    edge("c1", "c2"),
    edge("d1", "d2"),
    edge("c2", "join2"),
    edge("d2", "join2"),
    edge("join2", "GOAL"),
    edge("a1", "join2"),
    edge("START", "GOAL"),
  ],
};

/** A story that opens with fourteen independent pieces of work. */
const WIDE_OPENING: Graph = (() => {
  const tasks = Array.from({ length: 14 }, (_, at) => `t${at}`);
  return {
    nodes: [
      node({ id: "START", type: "START" }),
      ...tasks.map((id) => node({ id })),
      node({ id: "GOAL", type: "GOAL" }),
    ],
    edges: [
      ...tasks.map((id) => edge("START", id)),
      ...tasks.map((id) => edge(id, "GOAL")),
    ],
  };
})();

const GRAPHS: [string, Graph][] = [
  ["reading list", READING_LIST],
  ["spine with branches", SPINE_WITH_BRANCHES],
  ["diamonds", DIAMONDS],
  ["wide opening", WIDE_OPENING],
];

describe.each(GRAPHS)("%s", (_name, graph) => {
  const { nodeWidth, nodeHeight } = DEFAULT_LAYOUT;
  const { positions, spine, quality } = layoutStory(graph.nodes, graph.edges);
  const placed = graph.nodes.map((one) => ({
    ...one,
    positionX: positions.get(one.id)!.x,
    positionY: positions.get(one.id)!.y,
  }));
  const routes = routeEdges(placed, graph.edges);

  it("crosses no lines and runs none over a box", () => {
    expect(quality.edgeCrossings).toBe(0);
    expect(quality.edgeNodeIntersections).toBe(0);
    expect(quality.backwardEdges).toBe(0);
  });

  it("overlaps no two nodes", () => {
    const points = [...positions.values()];
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const apart =
          Math.abs(points[i].x - points[j].x) >= nodeWidth ||
          Math.abs(points[i].y - points[j].y) >= nodeHeight;
        expect(apart).toBe(true);
      }
    }
  });

  it("runs the main line straight through the middle", () => {
    expect(spine[0]).toBe("START");
    expect(spine[spine.length - 1]).toBe("GOAL");
    for (const id of spine) expect(positions.get(id)!.y).toBe(0);
  });

  it("draws the main line itself between neighbours, never around", () => {
    // A spine hop taken around the outside would be the one line the
    // reader is meant to follow, drawn along the edge of the picture.
    for (let at = 1; at < spine.length; at += 1) {
      const step = routes.get(`${spine[at - 1]}-${spine[at]}`);
      if (step) expect(step.kind).toBe("direct");
    }
  });

  it("takes every long dependency around the outside, clear of everything", () => {
    for (const [id, route] of routes) {
      const span =
        positions.get(graph.edges.find((one) => one.id === id)!.targetNodeId)!.x -
        positions.get(graph.edges.find((one) => one.id === id)!.sourceNodeId)!.x;
      const strideX = nodeWidth + DEFAULT_LAYOUT.gapX;

      if (span > strideX * 1.5) expect(route.kind).toBe("outer");
      if (route.kind !== "outer") continue;

      for (const point of positions.values()) {
        const through =
          route.laneY > point.y && route.laneY < point.y + nodeHeight;
        expect(through).toBe(false);
      }
    }
  });

  it("puts the same graph in the same place twice", () => {
    const again = layoutStory(placed, graph.edges);
    expect(again.quality.layoutMovement).toBe(0);
    for (const [id, point] of positions) {
      expect(again.positions.get(id)).toEqual(point);
    }
  });
});
