import type { ReactNode } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/Skeleton";
import { ArrowLeftIcon } from "@/components/icons";

/**
 * StoryShell's exact layout with its content still missing.
 *
 * Laid out from the same measurements as the real one — the same rows,
 * at the same heights, with the tab bar in the same place at each
 * width — so nothing resizes when the data lands. A frame that jumps a
 * few pixels on arrival undoes the point of showing a skeleton at all.
 *
 * The back link is real and clickable from the first frame: a story
 * that is slow to load must never trap you on the way out. The tabs
 * can't be, because a `loading.tsx` isn't given the route's params and
 * so doesn't know which story it would link to.
 */
export function StoryShellSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <header className="z-10 flex shrink-0 flex-col border-b border-border bg-bg">
        <div className="flex min-w-0 items-center gap-2.5 px-3 pt-2 pb-1.5 sm:px-5">
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
          <Skeleton className="h-4 w-4 rounded-md" />
        </div>

        <TabsSkeleton className="hidden sm:flex" />

        <div className="flex items-center gap-x-3 border-t border-border/60 px-3 py-1.5 sm:gap-x-4 sm:px-5">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="ml-auto h-5 w-24 rounded-full" />
        </div>
      </header>

      {children}

      <TabsSkeleton className="shrink-0 flex-col border-t border-border sm:hidden" />
    </div>
  );
}

function TabsSkeleton({ className }: { className: string }) {
  return (
    <div className={`flex w-full items-stretch ${className}`}>
      {[0, 1, 2].map((tab) => (
        <div
          key={tab}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 sm:flex-row"
        >
          <Skeleton className="h-[22px] w-[22px] rounded-md sm:h-3.5 sm:w-3.5" />
          <Skeleton className="h-2.5 w-10 sm:h-3.5 sm:w-12" />
        </div>
      ))}
    </div>
  );
}
