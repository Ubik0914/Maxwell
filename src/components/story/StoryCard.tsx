"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type MouseEvent } from "react";
import type { StoryListItem } from "@/repositories/story.repository";
import { ChevronDownIcon, SettingsIcon } from "@/components/icons";
import { StorySettingsDialog } from "@/components/story/StorySettingsDialog";
import { StoryDetails } from "@/components/story/StoryDetails";
import { STORY_STATUS_INK } from "@/components/story/status";

function formatRelativeTime(dateString: string): string {
  const diffMinutes = Math.round(
    (Date.now() - new Date(dateString).getTime()) / 60000,
  );

  if (diffMinutes < 1) return "Updated just now";
  if (diffMinutes < 60) return `Updated ${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Updated ${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  return `Updated ${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function Tally({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <span className="flex items-baseline gap-1">
      <span
        className={`text-sm leading-none font-semibold tabular-nums ${
          value > 0 ? tone : "text-text-faint"
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] tracking-[0.1em] text-text-faint uppercase">
        {label}
      </span>
    </span>
  );
}

/**
 * A story shown as the circuit it is: a rail from start to goal, filled
 * as far as the work has actually got, with a spark running it on
 * hover. The tallies stay one compact line so the card reads as an
 * object in a list rather than a report.
 *
 * Clicking doesn't navigate straight away — the card expands and fades
 * while the graph page fades up from the same scale (see `.story-card`
 * and `.graph-enter`), so the card reads as having *become* the graph.
 * Modified clicks are left to the browser so "open in new tab" still
 * works.
 *
 * Details open in place instead. Opening a story to see whether it was
 * the one you meant, and going back when it wasn't, is a round trip
 * for a question the list can already answer — so the card answers it
 * without giving up its own press, and the list keeps its place.
 */
export function StoryCard({
  story,
  today,
}: {
  story: StoryListItem;
  /** Today, as an ISO date — handed down so nothing reads the clock
   *  while rendering. */
  today: string;
}) {
  const router = useRouter();
  const [isLaunching, setIsLaunching] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();
  const href = `/stories/${story.id}`;

  const { done, ready, inProgress, blocked } = story.stats;
  const total = done + ready + inProgress + blocked;
  const progress = total === 0 ? 0 : done / total;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    setIsLaunching(true);
    router.push(href);
  }

  return (
    // The card is the frame; the link is what fills it. That split is
    // what lets the settings control be a *sibling* of the link rather
    // than a child of it — a button inside an anchor is two controls
    // fighting over one press, and the browser's own "open in new tab"
    // would inherit the fight. Keeping the frame on the outside also
    // means the lift on hover carries both, instead of the card
    // growing out from under a control pinned to its corner.
    <div
      className={`story-card relative rounded-xl border border-border bg-surface hover:border-accent hover:shadow-[0_0_18px_var(--accent-soft)] ${
        isLaunching ? "story-card-launch" : ""
      }`}
    >
      <Link
        href={href}
        onClick={handleClick}
        className="flex flex-col gap-3 px-4 pt-4 pb-3"
      >
        <div className="flex items-center gap-3 pr-7">
          <h2 className="min-w-0 flex-1 truncate font-medium text-text">
            {story.title}
          </h2>
          <span
            className={`flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase ${
              STORY_STATUS_INK[story.status]
            }`}
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]"
            />
            {story.status}
          </span>
        </div>

        <div className="relative h-px w-full bg-border" aria-hidden="true">
          <div
            className="absolute inset-y-0 left-0 bg-accent shadow-[0_0_6px_var(--accent)]"
            style={{ width: `${progress * 100}%` }}
          />
          <span className="absolute top-[-3px] left-0 h-[7px] w-[7px] rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          <span
            className={`absolute top-[-3px] right-0 h-[7px] w-[7px] rounded-full ${
              story.status === "COMPLETED"
                ? "bg-success shadow-[0_0_6px_var(--success)]"
                : "bg-border-strong"
            }`}
          />
          <span className="spark-run absolute top-[-2px] h-[5px] w-[5px] rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
        </div>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Tally value={done} label="Done" tone="text-success" />
          <Tally value={ready} label="Ready" tone="text-accent" />
          {inProgress > 0 && (
            <Tally value={inProgress} label="Progress" tone="text-warning" />
          )}
          <Tally value={blocked} label="Blocked" tone="text-danger" />
        </div>

      </Link>

      {/*
       * Outside the link, because it holds a control. A button inside
       * an anchor is two controls fighting over one press — the same
       * reason the settings icon is a sibling rather than a child.
       */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3">
        <span className="text-xs text-text-faint">
          {formatRelativeTime(story.updatedAt)}
        </span>
        <button
          type="button"
          onClick={() => setIsExpanded((open) => !open)}
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          className="-mr-1.5 flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          Details
          <ChevronDownIcon
            className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {isExpanded && (
        <StoryDetails id={detailsId} story={story} today={today} />
      )}

      {/* Hidden while the card is becoming the graph: it is not part
          of that animation and would be the one thing left behind. */}
      {!isLaunching && (
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          aria-label={`Settings for ${story.title}`}
          title="Story settings"
          className="absolute top-3.5 right-3.5 rounded-md p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      )}

      {isSettingsOpen && (
        <StorySettingsDialog
          story={story}
          onClose={() => setIsSettingsOpen(false)}
          // The card is in the list it would be deleted from, so there
          // is nowhere to go — the list simply loses a row.
          onDeleted={() => router.refresh()}
        />
      )}
    </div>
  );
}
