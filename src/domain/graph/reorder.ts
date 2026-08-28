import type { GraphNode } from "@/domain/graph/types";

/**
 * Where a task ends up in the story's order after being dropped at a
 * particular place in a *view* of it.
 *
 * The rank is story-wide, but nobody ever drags a card in a view of the
 * whole story: they drop it third in the Ready column, or between two
 * rows of a filtered list. So the drop says "put it before this one",
 * and this works out what that means for the full order.
 *
 * The anchor — the task the dropped one should now precede — is what
 * makes that translation exact. Recomputing ranks from the visible
 * subset alone would renumber tasks the person could not see, and
 * dropping at "index 2" of a filtered list would mean something
 * different every time the filter changed.
 *
 * @param ordered  every task in the story, in its current manual order
 * @param visible  the ordered subset the drop happened in
 * @param movedId  the task being dropped
 * @param index    where it landed in `visible`, counting without itself
 * @returns        the full order, as ids, ready for reorder_nodes
 */
export function reorderWithin(
  ordered: GraphNode[],
  visible: GraphNode[],
  movedId: string,
  index: number,
): string[] {
  const rest = ordered.filter((task) => task.id !== movedId);
  const visibleRest = visible.filter((task) => task.id !== movedId);

  // Dropped before a task that is still on screen: sit immediately
  // before it in the full order too.
  const anchor = visibleRest[index];
  if (anchor) {
    const at = rest.findIndex((task) => task.id === anchor.id);
    if (at !== -1) {
      return [
        ...rest.slice(0, at).map((task) => task.id),
        movedId,
        ...rest.slice(at).map((task) => task.id),
      ];
    }
  }

  // Dropped past the end of the view. Landing after the last task that
  // *was* visible keeps it inside the group it was dropped into —
  // appending to the whole story would put a card dropped at the bottom
  // of the Ready column behind every cancelled task as well.
  const last = visibleRest[visibleRest.length - 1];
  if (last) {
    const at = rest.findIndex((task) => task.id === last.id);
    if (at !== -1) {
      return [
        ...rest.slice(0, at + 1).map((task) => task.id),
        movedId,
        ...rest.slice(at + 1).map((task) => task.id),
      ];
    }
  }

  // Dropped into an empty view — an empty board column. There is
  // nothing to anchor to, so the end of the story is the only honest
  // answer.
  return [...rest.map((task) => task.id), movedId];
}
