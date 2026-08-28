import Link from "next/link";
import {
  STORY_FILTER_ORDER,
  storyFilterHref,
  type StoryFilter,
} from "@/features/story/filter";

const LABELS: Record<StoryFilter, string> = {
  ALL: "All",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export function StatusFilter({ current }: { current: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {STORY_FILTER_ORDER.map((value) => (
        <Link
          key={value}
          href={storyFilterHref(value)}
          aria-current={current === value ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm transition ${
            current === value
              ? "border-accent bg-accent-soft text-accent"
              : "border-border text-text-muted hover:border-border-strong hover:text-text"
          }`}
        >
          {LABELS[value]}
        </Link>
      ))}
    </div>
  );
}
