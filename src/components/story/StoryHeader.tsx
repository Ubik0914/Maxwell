import { MenuButton } from "@/components/layout/MenuButton";
import { ViewSwitcher } from "@/components/story/ViewSwitcher";
import { STORY_STATUS_INK } from "@/components/story/status";
import { StorySettingsButton } from "@/components/story/StorySettingsButton";
import { StatMeters } from "@/components/story/StatMeters";

/**
 * The graph is the page, so the header stays a thin instrument strip
 * over it — but in the shape a phone expects, which is the shape every
 * app with more than one view of the same thing has settled on:
 *
 *   1. a nav row — where you are, and the way anywhere else
 *   2. a full-width tab bar — which view of it you are looking at
 *   3. a readout — what the graph currently contains
 *
 * Row 1 opens the app's drawer, where it used to hold a back link to
 * the stories list. The drawer contains that link and every story
 * besides, so switching stories no longer means going out to the list
 * and coming back in — and the row costs the same width it did.
 *
 * On a phone row 2 is not here at all: a tab bar belongs under the
 * thumb, so StoryShell puts it along the bottom edge instead.
 *
 * The tabs used to be a small pill sharing row 2 with the counters,
 * which cost the counters a second line and gave the app's three main
 * screens a control the width of a thumb. Split apart, all three rows
 * together are shorter than the two rows they replace.
 */
export function StoryHeader({
  story,
  workspace,
  userEmail,
  stats,
  frontierCount,
}: {
  story: {
    id: string;
    title: string;
    description: string | null;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  };
  workspace: { id: string; name: string };
  userEmail: string;
  stats: { done: number; ready: number; inProgress: number; blocked: number };
  frontierCount: number;
}) {
  return (
    <header className="z-10 flex shrink-0 flex-col border-b border-border bg-bg">
      <div className="flex min-w-0 items-center gap-2.5 px-3 pt-2 pb-1.5 sm:px-5">
        <MenuButton
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          userEmail={userEmail}
          currentStoryId={story.id}
          className="-ml-1.5 shrink-0"
        />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-text sm:text-base">
          {story.title}
        </h1>
        <span
          className={`flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase ${
            STORY_STATUS_INK[story.status] ?? "text-text-muted"
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
      <ViewSwitcher base={`/stories/${story.id}`} className="hidden sm:flex" />

      <StatMeters stats={stats} frontierCount={frontierCount} />
    </header>
  );
}
