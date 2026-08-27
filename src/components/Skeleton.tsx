/**
 * A placeholder standing in for content that hasn't arrived.
 *
 * Deliberately shaped, not generic: each caller sizes it to the thing
 * it replaces, so a loading screen keeps the finished screen's layout
 * and the content lands without anything jumping. The sweep animation
 * lives in globals.css under `.skeleton`.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton block rounded ${className}`}
    />
  );
}
