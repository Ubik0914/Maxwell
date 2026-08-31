/**
 * A compact readout: one metric, its value first. Zero values are
 * dimmed so the eye lands on what the graph actually contains.
 */
function Meter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <span className="flex shrink-0 items-baseline gap-1">
      <span className={`text-sm leading-none font-semibold tabular-nums ${
        value > 0 ? tone : "text-text-faint"
      }`}
      >
        {value}
      </span>
      <span className="text-[10px] tracking-[0.12em] text-text-faint uppercase">
        {label}
      </span>
    </span>
  );
}

/**
 * What the graph in front of you currently contains — one story's, or
 * every story in the workspace at once. It counts nodes and says so,
 * which is a sentence that is true at either size, so both headers show
 * the identical strip rather than two that drift.
 *
 * It scrolls sideways rather than wrapping, for the same reason the
 * filter chips do: a row of numbers you glance at should not cost the
 * canvas a whole line of height when it doesn't fit.
 */
export function StatMeters({
  stats,
  frontierCount,
}: {
  stats: { done: number; ready: number; inProgress: number; blocked: number };
  frontierCount: number;
}) {
  return (
    // Bleeds to the screen edge so a counter scrolled to the end sits
    // flush rather than in a gutter.
    <div className="scroll-x flex items-center gap-x-3 border-t border-border/60 px-3 py-1.5 sm:gap-x-4 sm:px-5">
      <Meter label="Done" value={stats.done} tone="text-success" />
      <Meter label="Ready" value={stats.ready} tone="text-accent" />
      <Meter label="Progress" value={stats.inProgress} tone="text-warning" />
      <Meter label="Blocked" value={stats.blocked} tone="text-danger" />

      {/* The frontier — how many tasks can be picked up right now — is
          the one number that says what to do next, so it reads as a
          live indicator rather than another tally. `ml-auto` puts it at
          the far end while the row fits, and after the counters once it
          doesn't. */}
      <span
        title="Tasks that can be started right now"
        className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 ${
          frontierCount > 0 ? "border-accent/40 bg-accent-soft" : "border-border"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${
            frontierCount > 0 ? "indicator-live bg-accent" : "bg-text-faint"
          }`}
        />
        <span className="text-[10px] tracking-[0.14em] text-text-faint uppercase">
          Frontier
        </span>
        <span
          className={`text-xs leading-none font-semibold tabular-nums ${
            frontierCount > 0 ? "text-accent" : "text-text-faint"
          }`}
        >
          {frontierCount}
        </span>
      </span>
    </div>
  );
}
