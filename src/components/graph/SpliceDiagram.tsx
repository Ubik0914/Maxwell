/**
 * What inserting a task into a connection will do to it, drawn rather
 * than described: the two ends as terminals, the new task as a node
 * card on the line between them.
 *
 * Only the connection's "+" shows this now. It used to draw a branch
 * shape too, for the node's "+", but a branch is about named tasks —
 * where it starts and where it rejoins — and that dialog says it with
 * their names instead. Two anonymous boxes were the right picture for
 * an operation with no choice in it, and the wrong one for an operation
 * that is entirely a choice.
 */
export function SpliceDiagram() {
  return (
    <svg
      viewBox="0 0 220 72"
      className="h-16 w-full"
      role="img"
      aria-label="The existing connection is replaced by one running through a new task"
    >
      {/* The line that is already there, becoming the new route. */}
      <path
        d="M20 36H200"
        stroke="var(--accent)"
        strokeWidth="2"
        fill="none"
        opacity="0.7"
      />

      <rect
        x="90"
        y="27"
        width="40"
        height="18"
        rx="5"
        fill="var(--surface)"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />

      <circle
        cx="20"
        cy="36"
        r="5"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeWidth="2"
      />
      <circle
        cx="200"
        cy="36"
        r="5"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeWidth="2"
      />
    </svg>
  );
}
