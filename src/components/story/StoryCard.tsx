"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import type { StoryListItem } from "@/repositories/story.repository";

const STATUS_TONE: Record<StoryListItem["status"], string> = {
  ACTIVE: "text-accent",
  COMPLETED: "text-success",
  ARCHIVED: "text-text-faint",
};

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
 */
export function StoryCard({ story }: { story: StoryListItem }) {
  const router = useRouter();
  const [isLaunching, setIsLaunching] = useState(false);
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
    <Link
      href={href}
      onClick={handleClick}
      className={`story-card flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent hover:shadow-[0_0_18px_var(--accent-soft)] ${
        isLaunching ? "story-card-launch" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate font-medium text-text">
          {story.title}
        </h2>
        <span
          className={`flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase ${
            STATUS_TONE[story.status]
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

      <span className="text-xs text-text-faint">
        {formatRelativeTime(story.updatedAt)}
      </span>
    </Link>
  );
}
