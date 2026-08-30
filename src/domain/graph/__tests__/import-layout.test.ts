import { planImport } from "@/domain/graph/import";
import { planImportLayout } from "@/domain/graph/import-layout";
import type { GraphNode, GraphEdge } from "@/domain/graph/types";

function node(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    storyId: "story-1",
    type: "TASK",
    title: overrides.id,
    description: null,
    status: "READY",
    assigneeId: null,
    priority: null,
    dueDate: null,
    positionX: 0,
    positionY: 0,
    sortOrder: null,
    ...overrides,
  };
}

const NODES = [
  node({ id: "start", type: "START", title: "Today", status: null }),
  node({ id: "goal", type: "GOAL", title: "Shipped", status: null }),
];
const EDGES: GraphEdge[] = [
  { id: "e", storyId: "story-1", sourceNodeId: "start", targetNodeId: "goal" },
];

const plan = (csv: string, nodes = NODES, edges = EDGES) =>
  planImportLayout(planImport(csv, nodes).rows, nodes, edges);

describe("planImportLayout", () => {
  it("puts a chain in the order it has to happen", () => {
    const at = plan(["title,depends_on", "A,", "B,A", "C,B"].join("\n"));

    expect(at.get("A")!.x).toBeLessThan(at.get("B")!.x);
    expect(at.get("B")!.x).toBeLessThan(at.get("C")!.x);
  });

  it("puts tasks that could run at once side by side", () => {
    const at = plan(["title,depends_on", "A,", "B,A", "C,A"].join("\n"));

    expect(at.get("B")!.x).toBe(at.get("C")!.x);
    expect(at.get("B")!.y).not.toBe(at.get("C")!.y);
  });

  it("places every imported row and nothing else", () => {
    const at = plan(["title,depends_on", "A,", "B,A"].join("\n"));

    expect([...at.keys()].sort()).toEqual(["A", "B"]);
  });

  it("arranges against the story rather than beside it", () => {
    // A row hung off an existing task belongs after it, and a row
    // hanging off nothing belongs at the beginning. Without the edges
    // import_tasks is about to draw — including the ones to START and
    // GOAL — the imported rows would be laid out as a graph of their
    // own and both would come out in the same column.
    const existing = [
      ...NODES,
      node({ id: "schema", title: "Design the schema" }),
    ];
    const edges: GraphEdge[] = [
      { id: "e1", storyId: "story-1", sourceNodeId: "start", targetNodeId: "schema" },
      { id: "e2", storyId: "story-1", sourceNodeId: "schema", targetNodeId: "goal" },
    ];

    const at = plan(
      ["title,depends_on", "From scratch,", "After the schema,Design the schema"].join("\n"),
      existing,
      edges,
    );

    // Coordinates are relative and the whole thing is re-centred, so
    // what can be asserted is the order, which is the part that matters.
    expect(at.get("From scratch")!.x).toBeLessThan(
      at.get("After the schema")!.x,
    );
  });

  it("does not stack a heap of unconnected tasks on one spot", () => {
    const at = plan(["title", "A", "B", "C", "D"].join("\n"));
    const spots = new Set([...at.values()].map((point) => `${point.x},${point.y}`));

    expect(spots.size).toBe(4);
  });
});
