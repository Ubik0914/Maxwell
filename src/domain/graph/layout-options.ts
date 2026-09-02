export interface Point {
  x: number;
  y: number;
}

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  /** Air between one column and the next. */
  gapX: number;
  /** Air between two rows of the same family. */
  gapY: number;
  /** Air between one family and the next, so a fan reads as a block. */
  groupGapY: number;
  /** Air between the graph and a line routed around the outside of it,
   *  and between two such lines. */
  edgeClearance: number;
}

/**
 * Measured from the node the graph actually draws, not estimated: 170
 * wide by 75 tall, which is a two-line title — the most it can be,
 * since the title is clamped at two lines.
 *
 * The height was 64, between a one-line node and a two-line one, so two
 * long titles stacked left 37px of air where the gap says 48 and the
 * rows read as crowded. A layout that assumes a node is smaller than it
 * is will always draw them too close together; assuming the largest is
 * the only assumption that cannot be wrong in the direction that shows.
 *
 * `groupGapY` is twice `gapY`, which is what makes a family read as one
 * block: the eye groups by relative distance, so siblings only look
 * like siblings while the space around the group is clearly larger than
 * the space inside it.
 */
export const DEFAULT_LAYOUT: LayoutOptions = {
  nodeWidth: 170,
  nodeHeight: 75,
  gapX: 110,
  gapY: 48,
  groupGapY: 96,
  edgeClearance: 34,
};

/**
 * How many ranks an edge has to span before it stops being drawn
 * through the picture and goes around the outside instead.
 *
 * One rank is a hop to the column next door: there is nothing between
 * the two, so the line can only be a short diagonal. Two or more and
 * the line has to get past a column of other people's work — which is
 * the thing that used to be drawn straight over the middle of the
 * graph. See edge-route.
 */
export const LONG_EDGE_RANKS = 2;

/**
 * Why there is no wrapping constant here any more.
 *
 * A rank too tall to fit on a screen used to be dealt out over several
 * columns, the way a paragraph wraps, so that a story opening with
 * fourteen independent pieces of work did not stand fourteen rows high.
 * It bought that height back at a price the priorities do not allow:
 * the columns a wrapped rank spreads into sit between tasks that are
 * one step apart, so every line from the column before to the column
 * after is drawn straight across them. Measured on that same fan of
 * fourteen, wrapping cost twenty-three lines drawn over the top of a
 * box.
 *
 * Compactness is the last thing on the list and collisions are the
 * second; trading the second for the last is the wrong way round. So
 * `x` is `rank * strideX` with no exceptions, a tall rank is drawn
 * tall, and the canvas — which pans and zooms to fit — is left to deal
 * with the height.
 */
