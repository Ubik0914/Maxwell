import type { GraphNode } from "@/domain/graph/types";

/**
 * Which tasks a list or a board is showing — one story, or every story
 * in the workspace at once.
 *
 * It is a choice rather than a nullable id because the two differ in
 * what can be *done*, not only in what is shown. A manual order is a
 * sequence within one story, written whole (see reorderNodes), so tasks
 * from several stories cannot be arranged by hand: an interleaving is
 * an order neither story asked for. The workspace scope carries the
 * story names instead, which is the thing the aggregate needs and a
 * single story has no use for — every row would say the same word.
 */
export type TaskScope =
  | { kind: "story"; storyId: string }
  | { kind: "workspace"; storyTitles: ReadonlyMap<string, string> };

/** The story a write belongs to, or null where there isn't one. */
export function storyIdOf(scope: TaskScope): string | null {
  return scope.kind === "story" ? scope.storyId : null;
}

/**
 * Which story a task came from, to be said out loud — only worth
 * saying when more than one story is on screen.
 *
 * Always a string in the workspace scope, even for a story the map
 * somehow doesn't name: a row that quietly drops its story cell would
 * take the whole table one column out of step with its own header.
 */
export function storyTitleOf(
  scope: TaskScope,
  task: GraphNode,
): string | undefined {
  if (scope.kind === "story") return undefined;
  return scope.storyTitles.get(task.storyId) ?? "—";
}
