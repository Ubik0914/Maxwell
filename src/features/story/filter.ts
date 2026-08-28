export type StoryFilter = "ALL" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

/**
 * The filters in the order they are shown.
 *
 * "All" leads because it is the absence of a filter, and the rest run
 * from the state a story spends its life in to the one it ends up in.
 *
 * They used to be URLs, back when stories were a page — a filter was
 * somewhere you could be, and the back button could take you there. In
 * the drawer a filter narrows a menu while it is open and is gone when
 * it closes, which is what it always really was.
 */
export const STORY_FILTER_ORDER: StoryFilter[] = [
  "ALL",
  "ACTIVE",
  "COMPLETED",
  "ARCHIVED",
];
