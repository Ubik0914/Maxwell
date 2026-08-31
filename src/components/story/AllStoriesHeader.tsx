import { MenuButton } from "@/components/layout/MenuButton";
import { ViewSwitcher } from "@/components/story/ViewSwitcher";
import { StatMeters } from "@/components/story/StatMeters";

/**
 * The same instrument strip a story wears, counting the workspace.
 *
 * Two rows rather than a story's three, and the differences are the
 * ones the subject actually makes: there is no status to show, because
 * a status belongs to a story and "every story" has as many as it has
 * stories; and there is no settings control, because there is no single
 * row behind this to edit. What is left — the drawer, the three views,
 * and the tallies — is the same in both places, which is the point:
 * the workspace is looked at the way a story is.
 */
export function AllStoriesHeader({
  workspace,
  userEmail,
  storyCount,
  stats,
  frontierCount,
}: {
  workspace: { id: string; name: string };
  userEmail: string;
  storyCount: number;
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
          className="-ml-1.5 shrink-0"
        />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-text sm:text-base">
          All stories
        </h1>
        <span className="shrink-0 text-[10px] font-semibold tracking-[0.14em] text-text-faint uppercase">
          {storyCount} {storyCount === 1 ? "story" : "stories"}
        </span>
      </div>

      <ViewSwitcher base="/stories/all" className="hidden sm:flex" />

      <StatMeters stats={stats} frontierCount={frontierCount} />
    </header>
  );
}
