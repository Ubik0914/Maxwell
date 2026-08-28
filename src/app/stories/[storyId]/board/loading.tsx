import { Skeleton } from "@/components/Skeleton";
import { StoryShellSkeleton } from "@/components/story/StoryShellSkeleton";

/* How many cards each column gets while it waits — enough to read as
   columns holding different amounts of work rather than a grid. */
const COLUMNS = [3, 2, 1, 3, 0];

/**
 * Shown while the board is fetched.
 *
 * Real column frames with placeholder cards inside them, at the same
 * widths the board uses, so what arrives lands in place rather than
 * replacing a different shape.
 */
export default function StoryBoardLoading() {
  return (
    <StoryShellSkeleton>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-5">
        <Skeleton className="h-8 w-full rounded-md sm:w-64" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-5">
        <div className="flex h-full min-h-0 gap-3">
          {COLUMNS.map((cards, column) => (
            <section
              key={column}
              className="flex h-full w-64 shrink-0 flex-col rounded-xl border border-border bg-bg sm:w-72"
            >
              <div className="flex shrink-0 items-center gap-2 px-3 py-2">
                <Skeleton className="h-1.5 w-1.5 rounded-full" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="ml-auto h-3 w-4" />
              </div>
              <div className="flex flex-col gap-2 px-2 pb-2">
                {Array.from({ length: cards }, (_, card) => (
                  <Skeleton key={card} className="h-16 rounded-lg" />
                ))}
              </div>
            </section>
          ))}
        </div>
        <span className="sr-only">Loading board…</span>
      </div>
    </StoryShellSkeleton>
  );
}
