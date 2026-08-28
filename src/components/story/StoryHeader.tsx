import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { ViewSwitcher } from "@/components/story/ViewSwitcher";
import { StorySettingsButton } from "@/components/story/StorySettingsButton";

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
 * over it — but in the shape a phone expects, which is the shape every
 * app with more than one view of the same thing has settled on:
 *
 *   1. a nav row — where you are, and the way back out
 *   2. a full-width tab bar — which view of it you are looking at
 *   3. a readout — what the graph currently contains
 *
 * On a phone row 2 is not here at all: a tab bar belongs under the
 * thumb, so StoryShell puts it along the bottom edge instead.
 *
 * The tabs used to be a small pill sharing row 2 with the counters,
 * which cost the counters a second line and gave the app's three main
 * screens a control the width of a thumb. Split apart, all three rows
 * together are shorter than the two rows they replace.
 *
 * The readout scrolls sideways rather than wrapping, for the same
 * reason the filter chips do: a row of numbers you glance at should not
 * cost the canvas a whole line of height when it doesn't fit.
 */
export function StoryHeader({
  story,
  stats,
  frontierCount,
}: {
  story: {
    id: string;
    title: string;
    description: string | null;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  };
  stats: { done: number; ready: number; inProgress: number; blocked: number };
  frontierCount: number;
}) {
  return (
    <header className="z-10 flex shrink-0 flex-col border-b border-border bg-bg">
      <div className="flex min-w-0 items-center gap-2.5 px-3 pt-2 pb-1.5 sm:px-5">
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
        <StorySettingsButton story={story} />
      </div>

      {/* Up here only where there is a pointer. On a phone the tab bar
          lives along the bottom edge, where the thumb is — see
          StoryShell. */}
      <ViewSwitcher storyId={story.id} className="hidden sm:flex" />

      {/* Bleeds to the screen edge so a counter scrolled to the end
          sits flush rather than in a gutter. */}
      <div className="scroll-x flex items-center gap-x-3 border-t border-border/60 px-3 py-1.5 sm:gap-x-4 sm:px-5">
        <Meter label="Done" value={stats.done} tone="text-success" />
        <Meter label="Ready" value={stats.ready} tone="text-accent" />
        <Meter label="Progress" value={stats.inProgress} tone="text-warning" />
        <Meter label="Blocked" value={stats.blocked} tone="text-danger" />

        {/* The frontier — how many tasks can be picked up right now — is
            the one number that says what to do next, so it reads as a
            live indicator rather than another tally. `ml-auto` puts it
            at the far end while the row fits, and after the counters
            once it doesn't. */}
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
