"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { StoryListItem } from "@/repositories/story.repository";
import { storySwitchHref } from "@/features/story/switch-href";
import { STORY_STATUS_INK } from "@/components/story/status";
import { StoryDetails } from "@/components/story/StoryDetails";
import { StorySettingsDialog } from "@/components/story/StorySettingsDialog";
import { ChevronDownIcon, SettingsIcon } from "@/components/icons";

/**
 * How long ago, measured from when the list was fetched.
 *
 * Against `now` rather than the clock, because reading the clock while
 * rendering is impure and because the server's answer and the browser's
 * idea of the time do not have to agree. It is a snapshot taken when
 * the drawer opened, and it looks like one — nothing here ticks.
 */
function since(when: string, now: string): string {
  const minutes = Math.round(
    (new Date(now).getTime() - new Date(when).getTime()) / 60000,
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function Tally({ value, label, tone }: {
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <span className="flex shrink-0 items-baseline gap-0.5">
      <span
        className={`text-xs leading-none font-semibold tabular-nums ${
          value > 0 ? tone : "text-text-faint"
        }`}
      >
        {value}
      </span>
      <span className="text-[9px] tracking-[0.1em] text-text-faint uppercase">
        {label}
      </span>
    </span>
  );
}

/**
 * One story in the drawer: where it has got to, and what can be done
 * about it.
 *
 * This used to be a card on a page of its own, and when that page went
 * the drawer inherited a list of bare names — which could switch
 * between stories and nothing else. What the page was actually for was
 * seeing how far each one had got and settling the ones that were
 * finished, so all of that is here: the rail, the tallies, when it last
 * moved, the settings, and the details underneath.
 *
 * Three lines at rest, which is the most a menu can spend per row and
 * still be scannable. Everything beyond that — what the story is for,
 * what it says, what could be picked up — is behind the chevron.
 *
 * The row is a frame with a link inside it, not a link with buttons
 * inside: a button in an anchor is two controls fighting over one
 * press, and both of these do something other than "go there".
 */
export function StoryRow({
  story,
  now,
  isCurrent,
  pathname,
  onNavigate,
  onChanged,
}: {
  story: StoryListItem;
  now: string;
  isCurrent: boolean;
  pathname: string;
  onNavigate: () => void;
  /** A rename, archive or delete happened — the list is stale. */
  onChanged: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const detailsId = useId();

  const { done, ready, inProgress, blocked } = story.stats;
  const total = done + ready + inProgress + blocked;
  const progress = total === 0 ? 0 : done / total;

  return (
    <div
      className={`mx-1.5 rounded-lg transition-colors ${
        isCurrent ? "bg-accent-soft" : "hover:bg-surface-hover"
      }`}
    >
      <div className="flex items-start gap-1 pr-1.5">
        <Link
          href={storySwitchHref(story.id, pathname)}
          onClick={onNavigate}
          aria-current={isCurrent ? "page" : undefined}
          title={story.title}
          className="flex min-w-0 flex-1 flex-col gap-1.5 py-2 pl-3"
        >
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${
                isCurrent ? "text-accent" : STORY_STATUS_INK[story.status]
              }`}
            />
            <span
              className={`min-w-0 truncate text-sm ${
                isCurrent ? "text-accent" : "text-text"
              }`}
            >
              {story.title}
            </span>
          </span>

          {/* The story as the circuit it is: filled as far as the work
              has actually got. Same rail the cards had, at a width that
              fits a menu. */}
          <span
            aria-hidden="true"
            className="relative block h-px w-full bg-border"
          >
            <span
              className="absolute inset-y-0 left-0 bg-accent shadow-[0_0_5px_var(--accent)]"
              style={{ width: `${progress * 100}%` }}
            />
            <span
              className={`absolute top-[-2px] right-0 h-[5px] w-[5px] rounded-full ${
                story.status === "COMPLETED"
                  ? "bg-success shadow-[0_0_5px_var(--success)]"
                  : "bg-border-strong"
              }`}
            />
          </span>

          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <Tally value={done} label="Done" tone="text-success" />
            <Tally value={ready} label="Ready" tone="text-accent" />
            {inProgress > 0 && (
              <Tally value={inProgress} label="Prog" tone="text-warning" />
            )}
            <Tally value={blocked} label="Blocked" tone="text-danger" />
            <span className="ml-auto shrink-0 text-[10px] text-text-faint">
              {since(story.updatedAt, now)}
            </span>
          </span>
        </Link>

        <span className="flex shrink-0 flex-col items-center gap-0.5 py-2">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label={`Settings for ${story.title}`}
            title="Story settings"
            className="rounded-md p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((open) => !open)}
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            aria-label={`Details of ${story.title}`}
            title="Details"
            className="rounded-md p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <ChevronDownIcon
              className={`h-3.5 w-3.5 transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </span>
      </div>

      {isExpanded && (
        <StoryDetails
          id={detailsId}
          story={story}
          today={now.slice(0, 10)}
        />
      )}

      {isSettingsOpen && (
        <StorySettingsDialog
          story={story}
          onClose={() => setIsSettingsOpen(false)}
          // The drawer stays where it is. Deleting the story you happen
          // to be inside is the one case that has to move, and /stories
          // is what decides where to — it sends you to whatever is left.
          onDeleted={() => {
            setIsSettingsOpen(false);
            onChanged();
          }}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
