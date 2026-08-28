import type { StoryListItem } from "@/repositories/story.repository";
import { StoryCard } from "@/components/story/StoryCard";

export function StoryList({
  stories,
  today,
}: {
  stories: StoryListItem[];
  /** Today, as an ISO date, for the due dates a card shows when
   *  expanded — see story-data's todayIso for why it is handed down. */
  today: string;
}) {
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
    // `items-start` so a card that has been opened grows on its own
    // rather than stretching its whole row: without it, expanding one
    // card leaves the two beside it as tall empty boxes.
    <div className="story-grid grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((story) => (
        <StoryCard key={story.id} story={story} today={today} />
      ))}
    </div>
  );
}
