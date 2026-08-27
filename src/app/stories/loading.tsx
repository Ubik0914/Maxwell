import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/Skeleton";

/**
 * Shown while /stories fetches — most visibly when coming back from a
 * graph, where the browser would otherwise sit on the old screen with
 * nothing moving until the server answered.
 *
 * It renders the real AppShell and the real heading, so what arrives is
 * the list filling into a page that is already there, rather than a
 * whole new page replacing a frozen one. The card placeholders match
 * StoryCard's shape for the same reason: nothing should jump when the
 * data lands.
 */
function StoryCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="relative h-px w-full bg-border">
        <span className="absolute top-[-3px] left-0 h-[7px] w-[7px] rounded-full bg-border-strong" />
        <span className="absolute top-[-3px] right-0 h-[7px] w-[7px] rounded-full bg-border-strong" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

export default function StoriesLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6 p-4 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-text">Stories</h1>
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>

        <div className="flex flex-wrap gap-2">
          {["w-14", "w-20", "w-28", "w-24"].map((width) => (
            <Skeleton key={width} className={`h-7 ${width} rounded-full`} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StoryCardSkeleton />
          <StoryCardSkeleton />
          <StoryCardSkeleton />
        </div>
      </div>
    </AppShell>
  );
}
