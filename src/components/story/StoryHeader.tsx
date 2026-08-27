import Link from "next/link";

export function StoryHeader({
  story,
  stats,
  frontierCount,
}: {
  story: {
    id: string;
    title: string;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  };
  stats: { done: number; ready: number; inProgress: number; blocked: number };
  frontierCount: number;
}) {
  return (
    <header className="flex flex-col gap-2 border-b border-gray-200 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/stories"
          className="text-sm text-gray-500 hover:underline"
        >
          ← Stories
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">
          {story.title}
        </h1>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tracking-wide text-gray-600 uppercase">
          {story.status}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
        <span>Done {stats.done}</span>
        <span>Ready {stats.ready}</span>
        <span>In Progress {stats.inProgress}</span>
        <span>Blocked {stats.blocked}</span>
        <span>Current Frontier {frontierCount}</span>
      </div>
    </header>
  );
}
