import { Skeleton } from "@/components/Skeleton";

/**
 * The list's own shape while it loads: a header bar and a few rows the
 * height the real ones will be, so nothing jumps when they arrive.
 */
export default function RoutinesLoading() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-bg px-3 py-2 sm:px-5">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-5 sm:px-5">
        <span className="sr-only">Loading routines…</span>
        <Skeleton className="h-6 w-40" />
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
