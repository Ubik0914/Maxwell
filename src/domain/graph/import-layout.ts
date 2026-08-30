import type { GraphNode, GraphEdge } from "@/domain/graph/types";
import { layoutGraph, type Point } from "@/domain/graph/layout";
import type { ImportRow } from "@/domain/graph/import";

/**
 * Where each imported task should land.
 *
 * The rows have no ids yet — that is the whole reason the import speaks
 * in keys — so the layout is run over a graph in which the keys *are*
 * the ids, alongside the story as it currently stands. The arrangement
 * that comes back is the real one, from the same function the Auto
 * layout button uses, because a layout that only approximated it would
 * disagree with the first press of that button.
 *
 * Only the new tasks are moved. Rearranging what somebody had already
 * placed, as a side effect of adding to it, would be an import that
 * redecorates.
 */
export function planImportLayout(
  rows: ImportRow[],
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, Point> {
  const start = nodes.find((node) => node.type === "START");
  const goal = nodes.find((node) => node.type === "GOAL");
  const dependedOn = new Set(rows.flatMap((row) => row.after));

  const asNodes: GraphNode[] = rows.map((row) => ({
    id: row.key,
    storyId: "",
    type: "TASK",
    title: row.title,
    description: row.description,
    status: "READY",
    assigneeId: null,
    priority: null,
    dueDate: row.dueDate,
    positionX: 0,
    positionY: 0,
    sortOrder: null,
  }));

  // The same edges import_tasks is about to draw, including the two it
  // draws by itself — a row waiting on nothing starts at START, a row
  // nothing waits on leads to GOAL. Leave those out and every imported
  // chain floats free of the story and is laid out as if it were a
  // graph of its own.
  const asEdges: GraphEdge[] = [];
  const link = (sourceNodeId: string, targetNodeId: string) =>
    asEdges.push({
      id: `${sourceNodeId}->${targetNodeId}`,
      storyId: "",
      sourceNodeId,
      targetNodeId,
    });

  for (const row of rows) {
    for (const key of row.after) link(key, row.key);
    for (const id of row.afterIds) link(id, row.key);
    if (start && row.after.length === 0 && row.afterIds.length === 0) {
      link(start.id, row.key);
    }
    if (goal && !dependedOn.has(row.key)) link(row.key, goal.id);
  }

  const positions = layoutGraph([...nodes, ...asNodes], [...edges, ...asEdges]);

  const planned = new Map<string, Point>();
  for (const row of rows) {
    const point = positions.get(row.key);
    if (point) planned.set(row.key, point);
  }
  return planned;
}
