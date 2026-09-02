import type { GraphNode } from "@/domain/graph/types";

/**
 * What a notification says, before anything knows how to send one.
 *
 * Kept apart from the sending for the usual reason — this is the half
 * with a right answer, so it is the half worth testing — and because
 * the same text is used twice: as a system notification when nobody is
 * looking, and as a toast in the page when somebody is.
 */
export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping it should land. */
  url: string;
  /** Collapses a run of these into one. */
  tag: string;
}

export interface StorySummary {
  id: string;
  title: string;
}

const MAX_TITLE = 60;

function quote(title: string): string {
  const trimmed = title.trim();
  return `“${trimmed.length > MAX_TITLE ? `${trimmed.slice(0, MAX_TITLE - 1)}…` : trimmed}”`;
}

/**
 * The one thing worth interrupting somebody for: work that was waiting
 * on something is not waiting any more.
 *
 * Everything else the engine does is either visible on screen or of no
 * consequence to whoever is not looking. A task moving to IN_PROGRESS
 * is a person telling the app something, not the app telling them; a
 * task going back to BLOCKED is bad news that can wait until they next
 * open it. Becoming READY is the moment when there is something to do
 * that there was not a moment ago — which is exactly what somebody
 * asked to be told about when they turned notifications on.
 *
 * `affected` is what changeTaskStatus recalculated, demotions included,
 * so the promotions are picked out here rather than assumed.
 */
export function unblockedMessage(
  story: StorySummary,
  affected: GraphNode[],
): PushMessage | null {
  const ready = affected.filter(
    (node) => node.type === "TASK" && node.status === "READY",
  );
  if (ready.length === 0) return null;

  const [first, ...rest] = ready;
  const body =
    rest.length === 0
      ? `${quote(first.title)} is ready to start.`
      : `${quote(first.title)} and ${rest.length} more ${
          rest.length === 1 ? "task is" : "tasks are"
        } ready to start.`;

  return {
    title: story.title,
    body,
    url: `/stories/${story.id}`,
    // One tag per story, so five tasks unblocked one after another by an
    // agent working through a graph leave one notification about the
    // story rather than five to swipe away.
    tag: `story:${story.id}`,
  };
}

/**
 * The other end of the same story. It is the only other moment the
 * graph reaches a state nobody has to be told twice about, and it is
 * the one people actually want the phone to buzz for.
 */
export function completedMessage(story: StorySummary): PushMessage {
  return {
    title: story.title,
    body: "Every task is done. The story is complete.",
    url: `/stories/${story.id}`,
    tag: `story:${story.id}`,
  };
}
