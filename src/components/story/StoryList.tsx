import type { StoryListItem } from "@/repositories/story.repository";
import { StoryCard } from "@/components/story/StoryCard";

export function StoryList({ stories }: { stories: StoryListItem[] }) {
  if (stories.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border px-6 py-16 text-center text-text-faint">
        <p>No stories yet.</p>
        <p>Define a goal and build the path toward it.</p>
      </div>
    );
  }

  // `story-grid` is what lets a launching card push the rest of the grid
  // back (see globals.css) — the siblings dim so the one being opened
  // is unmistakably the thing becoming the next screen.
  return (
    <div className="story-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((story) => (
        <StoryCard key={story.id} story={story} />
      ))}
    </div>
  );
}
