import {
  layoutGraph,
  nextFreeSpot,
  DEFAULT_LAYOUT,
  type Point,
} from "@/domain/graph/layout";
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
    expect(layout.get("A")!.y).not.toBe(layout.get("B")!.y);
    // Centred on the shared axis rather than hung from the top.
    expect(layout.get("A")!.y + layout.get("B")!.y).toBe(0);
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
  const positions = layoutGraph(READING_LIST.nodes, READING_LIST.edges);
  const { nodeHeight } = DEFAULT_LAYOUT;

  /**
   * Where a straight line between two placed nodes sits at a given
   * column — which is what the canvas draws, since a bezier between two
   * points at the same height is a horizontal line.
   */
  function lineAt(from: string, to: string, column: number): number {
    const a = positions.get(from)!;
    const b = positions.get(to)!;
    const x = column * STRIDE_X;
    return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }

  function occupantsOf(column: number): number[] {
    return [...positions.entries()]
      .filter(([, point]) => columnOf(point.x) === column)
      .map(([, point]) => point.y);
  }

  it.each([
    ["android", "homo-2"],
    ["shoujo", "GOAL"],
  ])("runs %s -> %s clear of the nodes it passes", (from, to) => {
    const fromColumn = columnOf(positions.get(from)!.x);
    const toColumn = columnOf(positions.get(to)!.x);

    for (let column = fromColumn + 1; column < toColumn; column += 1) {
      const line = lineAt(from, to, column);
      for (const top of occupantsOf(column)) {
        // The line must miss every box in the column, not merely its
        // centre: a placeholder holds a whole row open.
        const missesBox = line + 1 < top || line > top + nodeHeight;
        expect(missesBox).toBe(true);
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

describe("wide columns", () => {
  const { nodeWidth, nodeHeight } = DEFAULT_LAYOUT;
  const STRIDE_Y = nodeHeight + DEFAULT_LAYOUT.gapY;

  /** How many nodes sit in each column of x. */
  function perColumn(positions: Map<string, Point>): number[] {
    const counted = new Map<number, number>();
    for (const point of positions.values()) {
      const at = columnOf(point.x);
      counted.set(at, (counted.get(at) ?? 0) + 1);
    }
    return [...counted.values()];
  }

  function height(positions: Map<string, Point>): number {
    const ys = [...positions.values()].map((point) => point.y);
    return Math.max(...ys) - Math.min(...ys) + nodeHeight;
  }

  it("leaves a column that fits where it is", () => {
    const { nodes, edges } = fan(5);
    const positions = layoutGraph(nodes, edges);

    // START, one column of five, GOAL.
    expect(new Set([...positions.values()].map((p) => columnOf(p.x))).size).toBe(3);
  });

  it("wraps a column too tall to read into several beside each other", () => {
    const { nodes, edges } = fan(14);
    const positions = layoutGraph(nodes, edges);

    expect(Math.max(...perColumn(positions))).toBeLessThanOrEqual(6);
    // START, three columns of tasks, GOAL.
    expect(new Set([...positions.values()].map((p) => columnOf(p.x))).size).toBe(5);
  });

  it("spends the width it took on height it no longer needs", () => {
    const fourteen = layoutGraph(...Object.values(fan(14)) as [GraphNode[], GraphEdge[]]);
    // Fourteen tasks in one column would stand fourteen rows tall. The
    // whole point of wrapping is that this does not.
    expect(height(fourteen)).toBeLessThan(7 * STRIDE_Y);
  });

  it("stops widening once the graph is wider than any screen", () => {
    const { nodes, edges } = fan(40);
    const positions = layoutGraph(nodes, edges);
    const taskColumns = new Set(
      [...positions.entries()]
        .filter(([id]) => id.startsWith("t"))
        .map(([, point]) => columnOf(point.x)),
    );

    expect(taskColumns.size).toBe(4);
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
    ["a wrapped column", fan(14)],
    ["a wrapped column with a long edge over it", {
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

  it("holds a row open through a wrapped column for an edge crossing it", () => {
    // START -> GOAL runs the whole width of the story, over three
    // columns that are all one wrapped layer. Wrapping suppresses the
    // reserved rows a layer would otherwise hold for its own tasks, and
    // this is the other half of that rule: an edge crossing somebody
    // else's layer still gets its lane, wrapped or not, which is
    // visible as the row it leaves on being empty in every column it
    // passes over.
    const { nodes, edges } = fan(14);
    const positions = layoutGraph(nodes, [...edges, edge("START", "GOAL")]);
    const lane = positions.get("START")!.y;

    for (const [id, point] of positions) {
      if (id === "START" || id === "GOAL") continue;
      expect(Math.abs(point.y - lane)).toBeGreaterThanOrEqual(nodeHeight);
    }
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
