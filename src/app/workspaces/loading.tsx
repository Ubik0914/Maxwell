import { Skeleton } from "@/components/Skeleton";

/**
 * Reached from the workspace name in the app header, so it has the same
 * frozen-screen problem the story list had — the heading and layout are
 * real from the first frame, the list fills in.
 */
export default function WorkspacesLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 bg-bg px-4 py-12">
      <h1 className="text-2xl font-semibold text-text">Your Workspaces</h1>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      <Skeleton className="h-28 rounded-lg" />
    </main>
  );
}
