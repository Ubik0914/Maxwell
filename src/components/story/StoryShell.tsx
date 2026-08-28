import type { ReactNode } from "react";
import type { GraphResult } from "@/features/graph/services/graph-service";
import { StoryHeader } from "@/components/story/StoryHeader";
import { ViewSwitcher } from "@/components/story/ViewSwitcher";

/**
 * The frame all three views of a story sit in.
 *
 * It exists because the tab bar is in two places at once — under the
 * title on a wide screen, along the bottom on a phone — and only one of
 * those can live inside the header. Rather than have each page remember
 * to hang a bar off its own bottom edge, the shell owns both and the
 * pages hand it their content.
 *
 * The bar is a flex sibling rather than a fixed overlay, so the canvas
 * ends where the bar begins. That is what keeps the graph's toolbar and
 * its overview — both positioned against the canvas's bottom edge —
 * sitting above the bar instead of under it.
 */
export function StoryShell({
  graph,
  children,
}: {
  graph: GraphResult;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <StoryHeader
        story={graph.story}
        stats={graph.stats}
        frontierCount={graph.frontier.length}
      />

      {children}

      <ViewSwitcher
        storyId={graph.story.id}
        placement="bottom"
        className="shrink-0 border-t border-border bg-bg sm:hidden"
      />
    </div>
  );
}
