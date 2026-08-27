import Link from "next/link";
import type { StoryListItem } from "@/repositories/story.repository";

function formatRelativeTime(dateString: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(dateString).getTime()) / 60000);

  if (diffMinutes < 1) return "Updated just now";
  if (diffMinutes < 60) return `Updated ${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Updated ${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  return `Updated ${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function StoryList({ stories }: { stories: StoryListItem[] }) {
  if (stories.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-gray-300 px-6 py-16 text-center text-gray-500">
        <p>No stories yet.</p>
        <p>Define a goal and build the path toward it.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((story) => (
        <Link
          key={story.id}
          href={`/stories/${story.id}`}
          className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-gray-400"
        >
          <h2 className="font-medium text-gray-900">{story.title}</h2>
          <span className="w-fit rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tracking-wide text-gray-600 uppercase">
            {story.status}
          </span>
          <dl className="flex flex-col gap-1 text-sm text-gray-600">
            <div className="flex justify-between">
              <dt>✓ Done</dt>
              <dd>{story.stats.done}</dd>
            </div>
            <div className="flex justify-between">
              <dt>○ Ready</dt>
              <dd>{story.stats.ready}</dd>
            </div>
            <div className="flex justify-between">
              <dt>🔒 Blocked</dt>
              <dd>{story.stats.blocked}</dd>
            </div>
          </dl>
          <span className="text-xs text-gray-400">
            {formatRelativeTime(story.updatedAt)}
          </span>
        </Link>
      ))}
    </div>
  );
}
