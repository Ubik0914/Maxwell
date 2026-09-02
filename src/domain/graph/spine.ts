import type { GraphNode } from "@/domain/graph/types";
import type { GraphIndex } from "@/domain/graph/rank";

/**
 * The story's main line: one path from START to GOAL, chosen to be the
 * one a reader should follow first.
 *
 * Everything else in the layout is arranged around it. The spine is
 * drawn along a single horizontal axis through the middle of the
 * canvas, and every other task hangs above or below it as a branch —
 * which is the difference between a picture with a subject and a
 * picture with a lot of boxes in it.
 *
 * The longest path is the one taken, because length here is not size:
 * a rank is a step that has to happen after the one before it, so the
 * longest chain is the one that determines when the story can finish.
 * It is the critical path, and the critical path is what a plan is
 * about.
 *
 * Ties are settled in this order:
 *
 *   1. the busier node — more edges through it means more of the story
 *      hangs off it, so putting it on the axis puts its branches
 *      nearest their parent
 *   2. the one already nearest the axis, so re-running the layout on a
 *      graph somebody has arranged by hand keeps the line they made
 *   3. the id, so that the same graph always produces the same picture
 *
 * With no START, no GOAL, or nothing joining the two, the longest path
 * available is used instead. A story mid-construction still deserves a
 * centre line.
 */
export function findSpine(
  nodes: GraphNode[],
  index: GraphIndex,
  rank: Map<string, number>,
): string[] {
  if (nodes.length === 0) return [];

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const { successors, predecessors } = index;

  const degree = (id: string) =>
    (successors.get(id)?.length ?? 0) + (predecessors.get(id)?.length ?? 0);

  /*
   * How far the longest path starting at each node reaches, counted in
   * ranks — and, when a GOAL exists, only along paths that arrive at
   * one. A branch that stops short is not the main line however long
   * it is; that is what "main" means.
   */
  const wantsGoal = nodes.some((node) => node.type === "GOAL");
  const reach = new Map<string, number>();
  const byDescendingRank = [...nodes].sort(
    (a, b) => (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0),
  );

  for (const node of byDescendingRank) {
    const ends = wantsGoal ? node.type === "GOAL" : true;
    let best = ends ? 0 : Number.NEGATIVE_INFINITY;

    for (const target of successors.get(node.id) ?? []) {
      const onward = reach.get(target);
      if (onward === undefined || onward === Number.NEGATIVE_INFINITY) continue;
      best = Math.max(best, onward + 1);
    }

    reach.set(node.id, best);
  }

  const better = (a: string, b: string): boolean => {
    const reachA = reach.get(a) ?? Number.NEGATIVE_INFINITY;
    const reachB = reach.get(b) ?? Number.NEGATIVE_INFINITY;
    if (reachA !== reachB) return reachA > reachB;
    if (degree(a) !== degree(b)) return degree(a) > degree(b);

    const yA = Math.abs(byId.get(a)?.positionY ?? 0);
    const yB = Math.abs(byId.get(b)?.positionY ?? 0);
    if (yA !== yB) return yA < yB;
    return a < b;
  };

  // Where to start walking: START if there is one, otherwise whichever
  // node with nothing before it gets furthest.
  const heads = nodes
    .filter((node) => (predecessors.get(node.id)?.length ?? 0) === 0)
    .map((node) => node.id);
  const start = nodes.find((node) => node.type === "START")?.id;
  const from =
    start ?? heads.reduce<string | undefined>(
      (best, id) => (best === undefined || better(id, best) ? id : best),
      undefined,
    );

  if (from === undefined) return [];
  if ((reach.get(from) ?? Number.NEGATIVE_INFINITY) < 0) {
    // Nothing from here arrives at the goal — the story is not joined
    // up yet. One node is not a spine; leave the layout without one.
    return [];
  }

  const path = [from];
  const seen = new Set(path);
  let at = from;

  for (;;) {
    const onward = (successors.get(at) ?? [])
      .filter((id) => !seen.has(id))
      .filter((id) => (reach.get(id) ?? Number.NEGATIVE_INFINITY) >= 0);

    /*
     * A step into the very next column is preferred over one that
     * jumps several, even where the jump would reach further.
     *
     * A step across two ranks or more is a long edge, and long edges
     * are drawn around the outside of the picture — which is right for
     * a dependency reaching over other people's work, and quite wrong
     * for the line the whole arrangement is built around. The main
     * line should be a line: a run of hops between neighbours, drawn
     * straight through the middle.
     *
     * It only ever comes up because GOAL is forced to the last column
     * whether the path to it is that long or not. Everywhere else the
     * longest path is contiguous by construction.
     */
    const here = rank.get(at) ?? 0;
    const adjacent = onward.filter((id) => (rank.get(id) ?? 0) === here + 1);
    const choices = adjacent.length > 0 ? adjacent : onward;

    const next = choices.reduce<string | undefined>(
      (best, id) => (best === undefined || better(id, best) ? id : best),
      undefined,
    );

    if (next === undefined) break;
    path.push(next);
    seen.add(next);
    at = next;
  }

  return path;
}
