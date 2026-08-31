import type { ReactNode } from "react";
import type { WorkspaceGraphResult } from "@/features/graph/services/graph-service";
import { PendingGraphProvider } from "@/features/graph/pending-graph";
import { AllStoriesHeader } from "@/components/story/AllStoriesHeader";
import { ViewSwitcher } from "@/components/story/ViewSwitcher";

/**
 * StoryShell's frame, around the workspace instead of one story.
 *
 * Same three views, same tab bar in the same two places, same
 * optimistic layer underneath — because every one of those was about
 * nodes and edges rather than about a story, and the aggregate has
 * nodes and edges too.
 */
export function AllStoriesShell({
  graph,
  userEmail,
  children,
}: {
  graph: WorkspaceGraphResult;
  userEmail: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <AllStoriesHeader
        workspace={graph.workspace}
        userEmail={userEmail}
        storyCount={graph.stories.length}
        stats={graph.stats}
        frontierCount={graph.frontier.length}
      />

      <PendingGraphProvider nodes={graph.nodes} edges={graph.edges}>
        {children}
      </PendingGraphProvider>

      <ViewSwitcher
        base="/stories/all"
        placement="bottom"
        className="shrink-0 border-t border-border bg-bg sm:hidden"
      />
    </div>
  );
}
