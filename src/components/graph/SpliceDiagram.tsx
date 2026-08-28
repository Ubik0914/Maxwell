export type SpliceShape = "insert" | "branch";

/**
 * What adding a task here will do to the graph, drawn rather than
 * described: the existing nodes as terminals, the new task as a node
 * card on the path it will occupy.
 *
 * Both dialogs that add a task to an existing path show this — the one
 * behind a connection's "+", which offers a choice of shape, and the one
 * behind a node's, which only ever branches. Two shapes tell the
 * difference faster than two sentences, and the drawing is the same
 * drawing either way, so it lives in one place.
 */
export function SpliceDiagram({ shape }: { shape: SpliceShape }) {
  const isBranch = shape === "branch";
  const railY = isBranch ? 20 : 36;

  return (
    <svg
      viewBox="0 0 220 72"
      className="h-16 w-full"
      role="img"
      aria-label={
        isBranch
          ? "The existing connection stays, and a new task is added on a parallel path that rejoins it"
          : "The existing connection is replaced by one running through a new task"
      }
    >
      {/* The path that is already there. In branch mode it survives, so
          it stays neutral; in insert mode it becomes the new route. */}
      <path
        d={`M20 ${railY}H200`}
        stroke={isBranch ? "var(--border-strong)" : "var(--accent)"}
        strokeWidth="2"
        fill="none"
        opacity={isBranch ? 1 : 0.7}
      />

      {isBranch && (
        <path
          d="M20 20C60 20 60 52 110 52C160 52 160 20 200 20"
          stroke="var(--accent)"
          strokeWidth="2"
          fill="none"
          opacity="0.7"
        />
      )}

      <rect
        x="90"
        y={isBranch ? 43 : 27}
        width="40"
        height="18"
        rx="5"
        fill="var(--surface)"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />

      <circle
        cx="20"
        cy={railY}
        r="5"
        fill="var(--surface)"
        stroke={isBranch ? "var(--accent)" : "var(--border-strong)"}
        strokeWidth="2"
      />
      <circle
        cx="200"
        cy={railY}
        r="5"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeWidth="2"
      />
    </svg>
  );
}
