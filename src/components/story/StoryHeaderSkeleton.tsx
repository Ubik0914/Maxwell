import Link from "next/link";
import { Skeleton } from "@/components/Skeleton";
import { ArrowLeftIcon } from "@/components/icons";

/**
 * StoryHeader's exact layout with its content still missing.
 *
 * Laid out from the same measurements as the real header so the strip
 * doesn't resize when the data lands — a header that jumps a few pixels
 * on arrival undoes the point of showing a skeleton at all.
 *
 * The back link is real and clickable from the first frame: a story that
 * is slow to load must never trap you on the way out. The view switcher
 * can't be, because a `loading.tsx` isn't given the route's params and
 * so doesn't know which story it would link to.
 */
export function StoryHeaderSkeleton() {
  return (
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
        <Skeleton className="h-7 w-24 rounded-lg sm:w-44" />
        <Skeleton className="h-3.5 w-14" />
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="ml-auto h-5 w-24 rounded-full" />
      </div>
    </header>
  );
}
