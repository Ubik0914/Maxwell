import type { GraphIndex } from "@/domain/graph/rank";

/** How many forward/backward sweeps to run. Past a handful it stops paying. */
const SWEEPS = 4;

/**
 * How strongly each side pulls when a node is looking for its row.
 *
 * Successors pull harder than predecessors. A reader follows the graph
 * forwards, so what a task leads to is what its position should
 * announce: a row that leans towards where the work is going converges
 * on the join, instead of fanning out and then doubling back into it.
 */
export const PREDECESSOR_PULL = 0.4;
export const SUCCESSOR_PULL = 0.6;

export interface OrderingInput {
  /** Node ids per rank, in the order to start from. */
  ranks: string[][];
  index: GraphIndex;
  /** The nodes on the main line — see findSpine. */
  spine: ReadonlySet<string>;
}

/**
 * A node's family: the exact set of tasks it waits on.
 *
 * Nodes with the same family are siblings in the only sense the graph
 * defines, and they are kept together as one block — nothing unrelated
 * is allowed between them. Written as the sorted predecessor ids, so
 * that "waits on A and B" and "waits on B and A" are the same family,
 * which they are.
 */
export function familyOf(id: string, index: GraphIndex): string {
  return [...(index.predecessors.get(id) ?? [])].sort().join(" ");
}

/** Where each id sits in its own rank. */
function indexWithinRank(ranks: string[][]): Map<string, number> {
  const at = new Map<string, number>();
  for (const rank of ranks) rank.forEach((id, index) => at.set(id, index));
  return at;
}

function mean(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Where a node would like to sit in its rank, as an index.
 *
 * `look` decides which neighbours are consulted: a forward sweep reads
 * only what feeds the node, a backward sweep only what it feeds, and a
 * settling sweep reads both, at the weights above. Whichever it is, a
 * node with nothing to consult keeps the place it has rather than
 * collecting at the top.
 */
function desiredIndex(
  id: string,
  fallback: number,
  at: Map<string, number>,
  index: GraphIndex,
  look: "forward" | "backward" | "both",
): number {
  const of = (ids: string[]) =>
    mean(
      ids
        .map((neighbour) => at.get(neighbour))
        .filter((value): value is number => value !== undefined),
    );

  const before = of(index.predecessors.get(id) ?? []);
  const after = of(index.successors.get(id) ?? []);

  if (look === "forward") return Number.isNaN(before) ? fallback : before;
  if (look === "backward") return Number.isNaN(after) ? fallback : after;

  if (Number.isNaN(before) && Number.isNaN(after)) return fallback;
  if (Number.isNaN(before)) return after;
  if (Number.isNaN(after)) return before;
  return PREDECESSOR_PULL * before + SUCCESSOR_PULL * after;
}

/**
 * Re-sorts one rank by where its nodes want to be, then puts the
 * families back together.
 *
 * The sort is the ordinary barycentre heuristic — the cheap half of
 * Sugiyama, and not the optimal answer, because crossing minimisation
 * is NP-hard and a task graph somebody is reading does not need the
 * optimal answer.
 *
 * The regrouping afterwards is the part that is not a heuristic.
 * Wanting to be near your neighbours and wanting to be beside your
 * siblings are different wishes, and where they disagree the siblings
 * win: a fan of four tasks off one parent, with an unrelated task
 * landing in the middle of it, reads as two fans.
 */
function sortRank(
  rank: string[],
  at: Map<string, number>,
  index: GraphIndex,
  look: "forward" | "backward" | "both",
  spine: ReadonlySet<string>,
): string[] {
  const wanted = new Map(
    rank.map((id, row) => [id, desiredIndex(id, row, at, index, look)]),
  );
  const given = new Map(rank.map((id, row) => [id, row]));

  const sorted = [...rank].sort(
    (a, b) => wanted.get(a)! - wanted.get(b)! || given.get(a)! - given.get(b)!,
  );

  return centreSpine(regroupFamilies(sorted, wanted, index), index, spine);
}

/**
 * Moves the rank's piece of the main line into the middle of its own
 * family, so the branches come off both sides of it.
 *
 * The spine is drawn along the canvas's axis and everything else in its
 * column is stacked away from it, so wherever the spine ends up in the
 * order is where the axis ends up in the picture. Left at the end of a
 * rank of nine, the axis is at the bottom of a graph nine rows tall and
 * the main line — the thing the whole arrangement is built around — is
 * along the edge of it.
 *
 * Asking for the middle as a barycentre does not work, because a
 * barycentre is an index in the *neighbouring* rank: where every
 * neighbour is a single node, every node in this rank asks for row
 * zero, and any number larger than that sorts last. So the wish is
 * granted afterwards, by moving one node, rather than competing with
 * numbers on a different scale.
 *
 * Within its family, because families are blocks and a block with a
 * hole cut in the middle of it is not one.
 */
function centreSpine(
  rank: string[],
  index: GraphIndex,
  spine: ReadonlySet<string>,
): string[] {
  const at = rank.findIndex((id) => spine.has(id));
  if (at === -1) return rank;

  const id = rank[at];
  const family = familyOf(id, index);
  let from = at;
  let to = at;
  while (from > 0 && familyOf(rank[from - 1], index) === family) from -= 1;
  while (to < rank.length - 1 && familyOf(rank[to + 1], index) === family) to += 1;

  const block = rank.slice(from, to + 1).filter((one) => one !== id);
  const middle = Math.floor(block.length / 2);

  return [
    ...rank.slice(0, from),
    ...block.slice(0, middle),
    id,
    ...block.slice(middle),
    ...rank.slice(to + 1),
  ];
}

/**
 * Pulls each family back into one contiguous block, keeping the blocks
 * in the order their members asked for.
 *
 * A family's place is the average of what its members wanted, so a
 * block sits where its members were heading rather than where its
 * first member happened to land.
 */
function regroupFamilies(
  rank: string[],
  wanted: Map<string, number>,
  index: GraphIndex,
): string[] {
  const families = new Map<string, string[]>();
  const order: string[] = [];

  for (const id of rank) {
    const family = familyOf(id, index);
    if (!families.has(family)) {
      families.set(family, []);
      order.push(family);
    }
    families.get(family)!.push(id);
  }

  // A rank whose nodes are all only children is already grouped; doing
  // the work would only risk reordering it for nothing.
  if (order.length === rank.length) return rank;

  const place = new Map(
    order.map((family) => [
      family,
      mean(families.get(family)!.map((id) => wanted.get(id)!)),
    ]),
  );
  const given = new Map(order.map((family, at) => [family, at]));

  return [...order]
    .sort((a, b) => place.get(a)! - place.get(b)! || given.get(a)! - given.get(b)!)
    .flatMap((family) => families.get(family)!);
}

/**
 * Several orderings worth considering. Best-first is deliberately not
 * promised — the caller lays each one out and scores the picture,
 * because the thing being judged is the drawing rather than the
 * permutation.
 *
 * The first candidate is the order that came in. On a graph nobody has
 * touched, that is the arrangement already on screen, so a re-run that
 * cannot do better leaves everything exactly where it was.
 *
 * The rest come from sweeping: left to right reading predecessors, then
 * right to left reading successors, then a settling pass that reads
 * both. Sweeping in one direction only propagates order from one end of
 * the graph, which is how a tidy start and a tangled finish happens.
 */
export function candidateOrderings({
  ranks,
  index,
  spine,
}: OrderingInput): string[][][] {
  const candidates: string[][][] = [ranks.map((rank) => [...rank])];
  let current = ranks.map((rank) => [...rank]);

  for (let pass = 0; pass < SWEEPS; pass += 1) {
    let at = indexWithinRank(current);

    for (let i = 1; i < current.length; i += 1) {
      current[i] = sortRank(current[i], at, index, "forward", spine);
      at = indexWithinRank(current);
    }

    for (let i = current.length - 2; i >= 0; i -= 1) {
      current[i] = sortRank(current[i], at, index, "backward", spine);
      at = indexWithinRank(current);
    }

    for (let i = 0; i < current.length; i += 1) {
      current[i] = sortRank(current[i], at, index, "both", spine);
      at = indexWithinRank(current);
    }

    candidates.push(current.map((rank) => [...rank]));
    current = current.map((rank) => [...rank]);
  }

  return candidates;
}
