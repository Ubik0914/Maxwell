import { Skeleton } from "@/components/Skeleton";
import { StoryHeaderSkeleton } from "@/components/story/StoryHeaderSkeleton";

/**
 * Shown while a story's graph is fetched.
 *
 * Below the header strip, the canvas's own dot grid with a few
 * node-shaped placeholders on it, so the wait reads as a graph arriving
 * rather than as a blank panel.
 */
export default function StoryGraphLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <StoryHeaderSkeleton />

      <div className="canvas-grid relative min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full items-center justify-center px-4">
          <div className="flex items-center">
            <Skeleton className="h-14 w-[130px] rounded-[10px] sm:w-[170px]" />
            <span aria-hidden="true" className="h-px w-8 bg-border-strong sm:w-16" />
            <Skeleton className="h-14 w-[130px] rounded-[10px] sm:w-[170px]" />
            <span
              aria-hidden="true"
              className="hidden h-px w-16 bg-border-strong sm:block"
            />
            <Skeleton className="hidden h-14 w-[170px] rounded-[10px] sm:block" />
          </div>
        </div>
        <span className="sr-only">Loading graph…</span>
      </div>
    </div>
  );
}
