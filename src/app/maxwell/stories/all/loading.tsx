import { StoryShellSkeleton } from "@/components/story/StoryShellSkeleton";

/**
 * Shown while every story's graph is fetched — the canvas's own dot
 * grid and nothing else, for the same reason the story graph's own
 * loading state shows nothing more: a placeholder shaped like a graph
 * is a shape about to be replaced by a different one.
 */
export default function AllStoriesGraphLoading() {
  return (
    <StoryShellSkeleton>
      <div className="canvas-grid relative min-h-0 flex-1 overflow-hidden">
        <span className="sr-only">Loading every story…</span>
      </div>
    </StoryShellSkeleton>
  );
}
