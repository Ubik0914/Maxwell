export type StoryFilter = "ALL" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

/**
 * The filters in the order they are shown, which is also the order a
 * swipe walks them.
 */
export const STORY_FILTER_ORDER: StoryFilter[] = [
  "ALL",
  "ACTIVE",
  "COMPLETED",
  "ARCHIVED",
];

export function isStoryFilter(value: string): value is StoryFilter {
  return (STORY_FILTER_ORDER as string[]).includes(value);
}

/** "All" is the absence of a filter, so it is the bare URL. */
export function storyFilterHref(value: StoryFilter): string {
  return value === "ALL" ? "/stories" : `/stories?status=${value}`;
}

/**
 * The filter one step along, or null at either end.
 *
 * Deliberately does not wrap. Running off the edge of a list and
 * landing back at the start is disorienting, and the end of the row is
 * worth being able to feel.
 */
export function stepStoryFilter(
  current: string,
  step: -1 | 1,
): StoryFilter | null {
  const at = STORY_FILTER_ORDER.indexOf(current as StoryFilter);
  if (at === -1) return null;
  return STORY_FILTER_ORDER[at + step] ?? null;
}
