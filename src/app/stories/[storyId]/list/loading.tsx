import { Skeleton } from "@/components/Skeleton";
import { StoryHeaderSkeleton } from "@/components/story/StoryHeaderSkeleton";

/* Varied on purpose: a stack of identical bars reads as a pattern, and a
   pattern reads as decoration rather than as content on its way. */
const ROW_WIDTHS = [
  "w-[62%]",
  "w-[38%]",
  "w-[75%]",
  "w-[48%]",
  "w-[66%]",
  "w-[42%]",
  "w-[58%]",
  "w-[35%]",
];

/**
 * Shown while the task list is fetched.
 *
 * Rows of the same height and rhythm as the real ones, so the list
 * doesn't reflow when the data lands.
 */
export default function StoryListLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <StoryHeaderSkeleton />

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-5">
        <Skeleton className="h-8 w-full rounded-md sm:w-64" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-18 rounded-full" />
        <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {ROW_WIDTHS.map((width, row) => (
          <div
            key={row}
            className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5"
          >
            <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className={`h-3.5 ${width}`} />
            </div>
            <Skeleton className="hidden h-3.5 w-14 shrink-0 sm:block" />
            <Skeleton className="hidden h-3.5 w-12 shrink-0 sm:block" />
          </div>
        ))}
        <span className="sr-only">Loading tasks…</span>
      </div>
    </div>
  );
}
