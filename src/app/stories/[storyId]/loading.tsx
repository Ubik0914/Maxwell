import { StoryShellSkeleton } from "@/components/story/StoryShellSkeleton";

/**
 * Shown while a story's graph is fetched.
 *
 * The canvas's own dot grid and nothing else. It used to carry a few
 * node-shaped placeholders, on the theory that they would read as a
 * graph arriving — but a real graph is nowhere near two rectangles in
 * the middle of the screen, so what they actually did was show a shape
 * that was about to be replaced by a different one. The grid alone says
 * the same thing without promising anything: this is a canvas, and it
 * is not ready yet.
 */
export default function StoryGraphLoading() {
  return (
    <StoryShellSkeleton>
      <div className="canvas-grid relative min-h-0 flex-1 overflow-hidden">
        <span className="sr-only">Loading graph…</span>
      </div>
    </StoryShellSkeleton>
  );
}
