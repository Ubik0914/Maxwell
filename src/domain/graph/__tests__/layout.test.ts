import {
  layoutGraph,
  layoutStory,
  nextFreeSpot,
  DEFAULT_LAYOUT,
  type Point,
} from "@/domain/graph/layout";
import { routeEdges } from "@/domain/graph/edge-route";
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
    // Deliberately all at the origin: the layout must not read the
    // positions it is about to replace.
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

const STRIDE_X = DEFAULT_LAYOUT.nodeWidth + DEFAULT_LAYOUT.gapX;

/** The same nodes, moved to where the layout put them. */
function placed(nodes: GraphNode[], positions: Map<string, Point>): GraphNode[] {
  return nodes.map((node) => ({
    ...node,
    positionX: positions.get(node.id)?.x ?? node.positionX,
    positionY: positions.get(node.id)?.y ?? node.positionY,
  }));
}

/** Which column a point landed in. */
function columnOf(x: number): number {
  return Math.round(x / STRIDE_X);
}

describe("layoutGraph", () => {
  it("puts a chain in consecutive columns on one line", () => {
    const nodes = [
      node({ id: "START", type: "START" }),
      node({ id: "A" }),
      node({ id: "GOAL", type: "GOAL" }),
    ];
    const edges = [edge("START", "A"), edge("A", "GOAL")];

    const layout = layoutGraph(nodes, edges);

    expect(columnOf(layout.get("START")!.x)).toBe(0);
    expect(columnOf(layout.get("A")!.x)).toBe(1);
    expect(columnOf(layout.get("GOAL")!.x)).toBe(2);
    // One node per column, so every column centres on the same axis.
    expect(layout.get("START")!.y).toBe(0);
    expect(layout.get("A")!.y).toBe(0);
    expect(layout.get("GOAL")!.y).toBe(0);
  });

  it("gives tasks that can run at the same time the same column", () => {
    const nodes = [
      node({ id: "START", type: "START" }),
      node({ id: "A" }),
      node({ id: "B" }),
      node({ id: "GOAL", type: "GOAL" }),
    ];
    const edges = [
      edge("START", "A"),
      edge("START", "B"),
      edge("A", "GOAL"),
      edge("B", "GOAL"),
    ];

    const layout = layoutGraph(nodes, edges);

    expect(columnOf(layout.get("A")!.x)).toBe(columnOf(layout.get("B")!.x));

    // One of the two carries the main line and sits on the axis; the
    // other is a branch off it, clear of the boxes above and below.
    const [main, branch] = [layout.get("A")!, layout.get("B")!].sort(
      (a, b) => Math.abs(a.y) - Math.abs(b.y),
    );
    expect(main.y).toBe(0);
    expect(Math.abs(branch.y)).toBeGreaterThanOrEqual(DEFAULT_LAYOUT.nodeHeight);
  });

  it("places a task after its deepest prerequisite, not its shallowest", () => {
    // START -> A -> B -> C and START -> C. Reading the short way round
    // would put C beside B and draw the A..B chain straight through it.
    const nodes = [
      node({ id: "START", type: "START" }),
      node({ id: "A" }),
      node({ id: "B" }),
      node({ id: "C" }),
    ];
    const edges = [
      edge("START", "A"),
      edge("A", "B"),
      edge("B", "C"),
      edge("START", "C"),
    ];

    const layout = layoutGraph(nodes, edges);

    expect(columnOf(layout.get("C")!.x)).toBe(3);
    expect(columnOf(layout.get("C")!.x)).toBeGreaterThan(
      columnOf(layout.get("B")!.x),
    );
  });

  it("keeps GOAL past everything even when a branch never reaches it", () => {
    const nodes = [
      node({ id: "START", type: "START" }),
      node({ id: "A" }),
      node({ id: "B" }),
      node({ id: "C" }),
      node({ id: "GOAL", type: "GOAL" }),
    ];
    // GOAL hangs off A, while B -> C runs on past it.
    const edges = [
      edge("START", "A"),
      edge("A", "GOAL"),
      edge("START", "B"),
      edge("B", "C"),
    ];

    const layout = layoutGraph(nodes, edges);
    const columns = [...layout].map(([, point]) => columnOf(point.x));

    expect(columnOf(layout.get("GOAL")!.x)).toBe(Math.max(...columns));
  });

  it("positions every node exactly once", () => {
    const nodes = [
      node({ id: "START", type: "START" }),
      node({ id: "A" }),
      node({ id: "orphan" }),
      node({ id: "GOAL", type: "GOAL" }),
    ];
    const edges = [edge("START", "A"), edge("A", "GOAL")];

    const layout = layoutGraph(nodes, edges);

    expect(layout.size).toBe(4);
    // A node nothing connects to still has to land somewhere sensible.
    expect(layout.get("orphan")).toBeDefined();
  });

  it("ignores edges pointing at nodes that are no longer there", () => {
    const nodes = [node({ id: "START", type: "START" }), node({ id: "A" })];
    const edges = [edge("START", "A"), edge("A", "deleted")];

    expect(() => layoutGraph(nodes, edges)).not.toThrow();
    expect(layoutGraph(nodes, edges).size).toBe(2);
  });

  it("returns nothing for an empty graph", () => {
    expect(layoutGraph([], []).size).toBe(0);
  });

  it("reduces crossings by ordering a column against its neighbours", () => {
    // START feeds A and B; A feeds Y, B feeds X. Listed so that the
    // naive order (X before Y) crosses, and the barycentre pass has to
    // swap them to untangle it.
    const nodes = [
      node({ id: "START", type: "START" }),
      node({ id: "A" }),
      node({ id: "B" }),
      node({ id: "X" }),
      node({ id: "Y" }),
    ];
    const edges = [
      edge("START", "A"),
      edge("START", "B"),
      edge("A", "Y"),
      edge("B", "X"),
    ];

    const layout = layoutGraph(nodes, edges);

    // Whatever vertical order A and B end up in, their successors must
    // follow the same order — that is what "no crossing" means here.
    const aAboveB = layout.get("A")!.y < layout.get("B")!.y;
    const yAboveX = layout.get("Y")!.y < layout.get("X")!.y;
    expect(yAboveX).toBe(aAboveB);
  });
});

/**
 * The graph from the reading list that showed the problem: three books
 * start at once, one of them runs straight to the goal four columns
 * along, and another jumps three columns to the last task.
 */
const READING_LIST = {
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

describe("long edges", () => {
  const { nodeWidth, nodeHeight } = DEFAULT_LAYOUT;
  const positions = layoutGraph(READING_LIST.nodes, READING_LIST.edges);
  const drawn = placed(READING_LIST.nodes, positions);
  const routes = routeEdges(drawn, READING_LIST.edges);

  function rankSpan(from: string, to: string): number {
    return columnOf(positions.get(to)!.x) - columnOf(positions.get(from)!.x);
  }

  it.each([
    ["android", "homo-2"],
    ["shoujo", "GOAL"],
  ])("takes %s -> %s around the outside instead of through", (from, to) => {
    expect(rankSpan(from, to)).toBeGreaterThanOrEqual(2);
    expect(routes.get(`${from}-${to}`)!.kind).toBe("outer");
  });

  it("draws every one-column hop between its own two ends", () => {
    for (const { id, sourceNodeId, targetNodeId } of READING_LIST.edges) {
      if (rankSpan(sourceNodeId, targetNodeId) >= 2) continue;
      expect(routes.get(id)!.kind).toBe("direct");
    }
  });

  it("keeps an outer lane clear of every node it passes over", () => {
    for (const route of routes.values()) {
      if (route.kind !== "outer") continue;
      for (const point of positions.values()) {
        const inside =
          route.laneY > point.y && route.laneY < point.y + nodeHeight;
        expect(inside).toBe(false);
      }
    }
  });

  it("never lets a long edge cross the main line", () => {
    const { spine } = layoutStory(READING_LIST.nodes, READING_LIST.edges);
    const axis = positions.get(spine[0])!.y + nodeHeight / 2;

    for (const [id, route] of routes) {
      if (route.kind !== "outer") continue;
      const { sourceNodeId, targetNodeId } = READING_LIST.edges.find(
        (candidate) => candidate.id === id,
      )!;
      const ends = [sourceNodeId, targetNodeId].map(
        (end) => positions.get(end)!.y + nodeHeight / 2,
      );

      // The lane is on the same side of the axis as the edge's own two
      // ends, so following it never means crossing the story's spine.
      const above = route.side === "above";
      expect(route.laneY < axis).toBe(above);
      for (const end of ends) {
        expect(above ? end <= axis : end >= axis).toBe(true);
      }
    }
  });

  it("still reads left to right, every task after what it waits on", () => {
    for (const { sourceNodeId, targetNodeId } of READING_LIST.edges) {
      expect(positions.get(sourceNodeId)!.x).toBeLessThan(
        positions.get(targetNodeId)!.x,
      );
    }
  });

  it("leaves nothing on the main line but the main line", () => {
    const { spine, quality } = layoutStory(
      READING_LIST.nodes,
      READING_LIST.edges,
    );

    // Every node on the spine at the same height, which is what makes
    // it read as one line rather than a chain of steps.
    for (const id of spine) expect(positions.get(id)!.y).toBe(0);
    expect(spine.length).toBeGreaterThan(2);
    // And nothing drawn through the picture runs over a box.
    expect(quality.edgeNodeIntersections).toBe(0);
    expect(nodeWidth).toBeGreaterThan(0);
  });
});

/**
 * The shape this is all about: a story that opens with a pile of work
 * nothing separates, so every one of those tasks lands in one column.
 */
function fan(count: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const tasks = Array.from({ length: count }, (_, index) => `t${index}`);
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
}

describe("tall ranks", () => {
  const { nodeWidth, nodeHeight } = DEFAULT_LAYOUT;

  /** How many nodes sit in each column of x. */
  function perColumn(positions: Map<string, Point>): number[] {
    const counted = new Map<number, number>();
    for (const point of positions.values()) {
      const at = columnOf(point.x);
      counted.set(at, (counted.get(at) ?? 0) + 1);
    }
    return [...counted.values()];
  }

  it("leaves a column that fits where it is", () => {
    const { nodes, edges } = fan(5);
    const positions = layoutGraph(nodes, edges);

    // START, one column of five, GOAL.
    expect(new Set([...positions.values()].map((p) => columnOf(p.x))).size).toBe(3);
  });

  it("draws a rank of fourteen as one column fourteen tall", () => {
    // This used to wrap into three columns to save the height. The
    // columns a wrapped rank spreads into sit between tasks that are
    // one step apart, so every line from START to the far column was
    // drawn straight over the near one — trading collisions, which are
    // second on the list, for compactness, which is last.
    const { nodes, edges } = fan(14);
    const positions = layoutGraph(nodes, edges);

    expect(new Set([...positions.values()].map((p) => columnOf(p.x))).size).toBe(3);
    expect(Math.max(...perColumn(positions))).toBe(14);
  });

  it("draws nothing over anything, however tall the rank", () => {
    const { nodes, edges } = fan(14);
    const { positions, quality } = layoutStory(nodes, edges);
    const points = [...positions.values()];

    expect(quality.edgeNodeIntersections).toBe(0);
    expect(quality.edgeCrossings).toBe(0);

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const apart =
          Math.abs(points[i].x - points[j].x) >= nodeWidth ||
          Math.abs(points[i].y - points[j].y) >= nodeHeight;
        expect(apart).toBe(true);
      }
    }
  });

  it("still reads left to right, every task after what it waits on", () => {
    const { nodes, edges } = fan(14);
    const positions = layoutGraph(nodes, edges);

    for (const { sourceNodeId, targetNodeId } of edges) {
      expect(positions.get(sourceNodeId)!.x).toBeLessThan(
        positions.get(targetNodeId)!.x,
      );
    }
  });

  it.each([
    ["a tall rank", fan(14)],
    ["a tall rank with a long edge over it", {
      nodes: fan(14).nodes,
      edges: [...fan(14).edges, edge("START", "GOAL")],
    }],
    ["the reading list", READING_LIST],
  ])("never draws two nodes on top of each other: %s", (_name, graph) => {
    const positions = [...layoutGraph(graph.nodes, graph.edges).values()];

    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const apart =
          Math.abs(positions[i].x - positions[j].x) >= nodeWidth ||
          Math.abs(positions[i].y - positions[j].y) >= nodeHeight;
        expect(apart).toBe(true);
      }
    }
  });

  it("takes an edge across a tall rank around the outside of it", () => {
    // START -> GOAL spans the whole story, so it has a column of
    // fourteen other people's tasks in the way. It is not drawn through
    // them: a line that has to get past somebody else's work goes over
    // the top of the picture instead, and the lane it takes is clear of
    // every box on the canvas.
    const { nodes, edges } = fan(14);
    const all = [...edges, edge("START", "GOAL")];
    const positions = layoutGraph(nodes, all);
    const route = routeEdges(placed(nodes, positions), all).get("START-GOAL")!;

    expect(route.kind).toBe("outer");
    if (route.kind !== "outer") return;

    for (const point of positions.values()) {
      const inside = route.laneY > point.y && route.laneY < point.y + nodeHeight;
      expect(inside).toBe(false);
    }
  });
});

describe("the main line", () => {
  const { nodeHeight } = DEFAULT_LAYOUT;

  /**
   * The shape the layout exists to draw: a spine with branches, one of
   * which reaches right across the story.
   *
   *   START -> D -> E -> F -> GOAL
   *              B  C        (branches off D)
   *   A ------------------------> GOAL   (a long way round)
   */
  const BRANCHED = {
    nodes: [
      node({ id: "START", type: "START" }),
      node({ id: "A" }),
      node({ id: "B" }),
      node({ id: "C" }),
      node({ id: "D" }),
      node({ id: "E" }),
      node({ id: "F" }),
      node({ id: "GOAL", type: "GOAL" }),
    ],
    edges: [
      edge("START", "A"),
      edge("START", "D"),
      edge("D", "B"),
      edge("D", "C"),
      edge("D", "E"),
      edge("E", "F"),
      edge("F", "GOAL"),
      edge("A", "GOAL"),
      edge("B", "GOAL"),
      edge("C", "GOAL"),
    ],
  };

  it("runs START to GOAL along one straight horizontal line", () => {
    const { positions, spine } = layoutStory(BRANCHED.nodes, BRANCHED.edges);

    expect(spine[0]).toBe("START");
    expect(spine[spine.length - 1]).toBe("GOAL");
    // The longest way round, not the shortest: the spine is the chain
    // that decides when the story can finish.
    expect(spine).toEqual(["START", "D", "E", "F", "GOAL"]);
    for (const id of spine) expect(positions.get(id)!.y).toBe(0);
  });

  it("hangs the branches off the line rather than on it", () => {
    const { positions, spine } = layoutStory(BRANCHED.nodes, BRANCHED.edges);
    const onSpine = new Set(spine);

    for (const [id, point] of positions) {
      if (onSpine.has(id)) continue;
      expect(Math.abs(point.y)).toBeGreaterThanOrEqual(nodeHeight);
    }
  });

  it("keeps a family together, with nothing unrelated between them", () => {
    // Two parents, three children each, all in one rank. A rank that
    // interleaved them would draw six lines through each other.
    const parents = ["p1", "p2"];
    const children = ["a1", "a2", "a3", "b1", "b2", "b3"];
    const nodes = [
      node({ id: "START", type: "START" }),
      ...parents.map((id) => node({ id })),
      ...children.map((id) => node({ id })),
      node({ id: "GOAL", type: "GOAL" }),
    ];
    const edges = [
      ...parents.map((id) => edge("START", id)),
      ...["a1", "a2", "a3"].map((id) => edge("p1", id)),
      ...["b1", "b2", "b3"].map((id) => edge("p2", id)),
      ...children.map((id) => edge(id, "GOAL")),
    ];

    const positions = layoutGraph(nodes, edges);
    const rows = children
      .map((id) => ({ id, y: positions.get(id)!.y }))
      .sort((a, b) => a.y - b.y)
      .map(({ id }) => id[0]);

    // Read top to bottom, the children come in two runs — "aaabbb" or
    // "bbbaaa" — never interleaved.
    expect(rows.join("")).toMatch(/^(a{3}b{3}|b{3}a{3})$/);
  });

  it("puts a wider gap between families than inside one", () => {
    const nodes = [
      node({ id: "START", type: "START" }),
      node({ id: "p1" }),
      node({ id: "p2" }),
      node({ id: "a1" }),
      node({ id: "a2" }),
      node({ id: "b1" }),
      node({ id: "GOAL", type: "GOAL" }),
    ];
    const edges = [
      edge("START", "p1"),
      edge("START", "p2"),
      edge("p1", "a1"),
      edge("p1", "a2"),
      edge("p2", "b1"),
      edge("a1", "GOAL"),
      edge("a2", "GOAL"),
      edge("b1", "GOAL"),
    ];

    const positions = layoutGraph(nodes, edges);
    const between = (a: string, b: string) =>
      Math.abs(positions.get(a)!.y - positions.get(b)!.y);

    expect(between("a1", "a2")).toBeCloseTo(
      nodeHeight + DEFAULT_LAYOUT.gapY,
      5,
    );
    // b1 is a different family, so whichever of a1/a2 it lands beside
    // is further away than they are from each other.
    const nearest = Math.min(between("b1", "a1"), between("b1", "a2"));
    expect(nearest).toBeGreaterThan(between("a1", "a2"));
  });

  it("keeps everything feeding the same task together", () => {
    // Five tasks that can all run at once, three of which converge on
    // one join and two on another. Nothing about their own dependencies
    // separates them — they all wait on START — so the only reason to
    // order them is where they are going, and going to the same place
    // should mean sitting beside each other.
    const feeding = { X: ["p1", "p2", "p3"], Y: ["q1", "q2"] };
    const tasks = [...feeding.X, ...feeding.Y];
    const nodes = [
      node({ id: "START", type: "START" }),
      ...tasks.map((id) => node({ id })),
      node({ id: "X" }),
      node({ id: "Y" }),
      node({ id: "GOAL", type: "GOAL" }),
    ];
    const edges = [
      ...tasks.map((id) => edge("START", id)),
      ...feeding.X.map((id) => edge(id, "X")),
      ...feeding.Y.map((id) => edge(id, "Y")),
      edge("X", "GOAL"),
      edge("Y", "GOAL"),
    ];

    const positions = layoutGraph(nodes, edges);
    const rows = tasks
      .map((id) => ({ id, y: positions.get(id)!.y }))
      .sort((a, b) => a.y - b.y)
      .map(({ id }) => id[0]);

    expect(rows.join("")).toMatch(/^(p{3}q{2}|q{2}p{3})$/);
  });

  it("draws the same graph the same way twice", () => {
    const first = layoutGraph(BRANCHED.nodes, BRANCHED.edges);
    const second = layoutGraph(placed(BRANCHED.nodes, first), BRANCHED.edges);

    for (const [id, point] of first) {
      expect(second.get(id)).toEqual(point);
    }
  });

  it("leaves a graph it cannot improve exactly where it is", () => {
    const settled = layoutGraph(BRANCHED.nodes, BRANCHED.edges);
    const again = layoutStory(placed(BRANCHED.nodes, settled), BRANCHED.edges);

    expect(again.quality.layoutMovement).toBe(0);
  });
});

describe("nextFreeSpot", () => {
  const { nodeWidth, nodeHeight, gapX, gapY } = DEFAULT_LAYOUT;

  it("puts the first task at the origin", () => {
    expect(nextFreeSpot([])).toEqual({ x: 0, y: 0 });
  });

  it("places a task one column in from START and below everything", () => {
    const nodes = [
      node({ id: "start", type: "START", positionX: -400, positionY: 0 }),
      node({ id: "a", positionX: -100, positionY: 120 }),
      node({ id: "goal", type: "GOAL", positionX: 300, positionY: 40 }),
    ];

    expect(nextFreeSpot(nodes)).toEqual({
      x: -400 + nodeWidth + gapX,
      y: 120 + nodeHeight + gapY,
    });
  });

  it("stacks, so two tasks added in a row do not land on each other", () => {
    const nodes = [node({ id: "start", type: "START" })];
    const first = nextFreeSpot(nodes);
    const second = nextFreeSpot([
      ...nodes,
      node({ id: "a", positionX: first.x, positionY: first.y }),
    ]);

    expect(second.x).toBe(first.x);
    expect(second.y).toBeGreaterThanOrEqual(first.y + nodeHeight);
  });

  it("falls back to the leftmost node when a story has no START", () => {
    const nodes = [
      node({ id: "a", positionX: 250, positionY: 0 }),
      node({ id: "b", positionX: 80, positionY: 0 }),
    ];
    expect(nextFreeSpot(nodes).x).toBe(80 + nodeWidth + gapX);
  });
});
