import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";

const STORY_STATUS_TONE: Record<string, string> = {
  ACTIVE: "text-accent",
  COMPLETED: "text-success",
  ARCHIVED: "text-text-faint",
};

/**
 * A compact readout strip: one metric, its value first. Zero values are
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
 * The graph is the page, so the header stays a thin instrument strip
 * over it: one line of identity, one line of readouts. Everything that
 * used to be prose ("Current Frontier 1") is now a gauge.
 */
export function StoryHeader({
  story,
  stats,
  frontierCount,
}: {
  story: {
    id: string;
    title: string;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  };
  stats: { done: number; ready: number; inProgress: number; blocked: number };
  frontierCount: number;
}) {
  return (
    <header className="z-10 flex shrink-0 flex-col gap-1.5 border-b border-border bg-bg px-3 py-2 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link
          href="/stories"
          title="Back to stories"
          className="flex shrink-0 items-center gap-1 text-sm text-text-faint transition-colors hover:text-accent"
        >
          <ArrowLeftIcon />
          <span className="hidden sm:inline">Stories</span>
          <span className="sr-only">Back to stories</span>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-text sm:text-base">
          {story.title}
        </h1>
        <span
          className={`flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase ${
            STORY_STATUS_TONE[story.status] ?? "text-text-muted"
          }`}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]"
          />
          {story.status}
        </span>
      </div>

      {/* Wraps rather than scrolls: on a narrow phone the frontier
          indicator dropping to its own line is fine, silently sliding
          off the right edge is not. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-4">
        <Meter label="Done" value={stats.done} tone="text-success" />
        <Meter label="Ready" value={stats.ready} tone="text-accent" />
        <Meter label="Progress" value={stats.inProgress} tone="text-warning" />
        <Meter label="Blocked" value={stats.blocked} tone="text-danger" />

        {/* The frontier — how many tasks can be picked up right now — is
            the one number that says what to do next, so it reads as a
            live indicator rather than another tally. */}
        <span
          title="Tasks that can be started right now"
          className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 ${
            frontierCount > 0
              ? "border-accent/40 bg-accent-soft"
              : "border-border"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              frontierCount > 0
                ? "indicator-live bg-accent"
                : "bg-text-faint"
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
    </header>
  );
}
