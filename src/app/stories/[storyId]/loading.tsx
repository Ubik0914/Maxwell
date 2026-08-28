import Link from "next/link";
import { Skeleton } from "@/components/Skeleton";
import { ArrowLeftIcon } from "@/components/icons";

/**
 * Shown while a story's graph is fetched.
 *
 * The header strip is laid out exactly as StoryHeader's, and the back
 * link is real and clickable from the first frame — a graph that is
 * slow to load must never trap you on the way out. Below it, the
 * canvas's own dot grid with a few node-shaped placeholders on it, so
 * the wait reads as a graph arriving rather than as a blank panel.
 */
export default function StoryGraphLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <header className="z-10 flex shrink-0 flex-col gap-1.5 border-b border-border bg-bg px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/stories"
            title="Back to stories"
            className="flex shrink-0 items-center gap-1 text-sm text-text-faint transition-colors hover:text-accent"
          >
            <ArrowLeftIcon />
            <span className="hidden sm:inline">Stories</span>
            <span className="sr-only">Back to stories</span>
          </Link>
          <Skeleton className="h-4 w-40 max-w-[45%]" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-4">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-18" />
          <Skeleton className="ml-auto h-5 w-24 rounded-full" />
        </div>
      </header>

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
