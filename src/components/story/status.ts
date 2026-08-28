import type { StoryLink } from "@/repositories/story.repository";

/**
 * What colour a story's state is, wherever it is shown.
 *
 * The card, the header strip and the drawer's list all say the same
 * three words about the same three states, and were each deciding on
 * their own what colour to say them in. One map, so a story doesn't
 * change colour on the way between screens.
 */
export const STORY_STATUS_INK: Record<StoryLink["status"], string> = {
  ACTIVE: "text-accent",
  COMPLETED: "text-success",
  ARCHIVED: "text-text-faint",
};
