"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  STORY_FILTER_ORDER,
  storyFilterHref,
  stepStoryFilter,
  type StoryFilter,
} from "@/features/story/filter";
import { useSwipeFilter } from "@/hooks/useSwipeFilter";

/**
 * The list of stories, swipeable between filters.
 *
 * The filter lives in the URL here rather than in state, so a swipe is
 * a navigation — which also means the direction has to be worked out
 * from what arrives rather than remembered from what was asked for.
 * Comparing the incoming filter against the last one rendered does it,
 * adjusted during render so the new list and the direction it came from
 * land in the same commit.
 *
 * Stops at both ends rather than wrapping: running off the edge of a
 * list and landing back at the start is disorienting, and the end is
 * worth feeling.
 */
export function StoriesPane({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [seen, setSeen] = useState(current);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  // Bumped on every change so the pane remounts and replays the
  // animation; a class alone only fires when the class itself changes,
  // which two swipes the same way would not do.
  const [seq, setSeq] = useState(0);

  if (current !== seen) {
    const from = STORY_FILTER_ORDER.indexOf(seen as StoryFilter);
    const to = STORY_FILTER_ORDER.indexOf(current as StoryFilter);
    setDirection(to > from ? 1 : -1);
    setSeen(current);
    setSeq((n) => n + 1);
  }

  const swipe = useSwipeFilter({
    onSwipe: (step) => {
      const next = stepStoryFilter(current, step);
      if (next === null) return;
      router.push(storyFilterHref(next));
    },
  });

  return (
    <div {...swipe}>
      <div
        key={seq}
        className={
          direction === 1
            ? "pane-from-right"
            : direction === -1
              ? "pane-from-left"
              : ""
        }
      >
        {children}
      </div>
    </div>
  );
}
