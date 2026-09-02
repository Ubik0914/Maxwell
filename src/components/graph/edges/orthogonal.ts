import type { Point } from "@/domain/graph/layout-options";

/** How much of each corner is rounded off. */
const CORNER = 12;

/**
 * A path through the given corners, drawn as straight runs with the
 * turns rounded.
 *
 * Straight runs rather than one long curve, because a line that only
 * ever goes across or up is a line you can follow with your eye: at
 * every point it is obvious which way it is heading, and two of them
 * side by side stay side by side. A bezier between the same two points
 * is shorter and prettier and, once there are four of them leaving the
 * same column, unreadable.
 *
 * A corner is cut back by no more than half of either run into it, so
 * the rounding can never eat a whole segment and turn the path inside
 * out on a short hop.
 */
export function orthogonalPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  const parts = [`M ${points[0].x},${points[0].y}`];

  for (let at = 1; at < points.length - 1; at += 1) {
    const from = points[at - 1];
    const corner = points[at];
    const to = points[at + 1];

    const back = shortenTowards(corner, from);
    const on = shortenTowards(corner, to);

    parts.push(`L ${back.x},${back.y}`);
    parts.push(`Q ${corner.x},${corner.y} ${on.x},${on.y}`);
  }

  const end = points[points.length - 1];
  parts.push(`L ${end.x},${end.y}`);
  return parts.join(" ");
}

/** A point `CORNER` along from the corner towards its neighbour, or
 *  halfway if the run is too short to spare that much. */
function shortenTowards(corner: Point, towards: Point): Point {
  const dx = towards.x - corner.x;
  const dy = towards.y - corner.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return corner;

  const cut = Math.min(CORNER, length / 2) / length;
  return { x: corner.x + dx * cut, y: corner.y + dy * cut };
}

/**
 * The middle of the longest straight run — where a control on this
 * line belongs.
 *
 * Not the middle of the path: on a long edge that is somewhere along
 * the way up or down to its lane, which is the one part of the line
 * that is not obviously *this* line. The longest run is the lane
 * itself, and a button sitting in the middle of it is unambiguous.
 */
export function longestRunMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };

  let best = { x: points[0].x, y: points[0].y };
  let longest = -1;

  for (let at = 1; at < points.length; at += 1) {
    const from = points[at - 1];
    const to = points[at];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > longest) {
      longest = length;
      best = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    }
  }

  return best;
}
