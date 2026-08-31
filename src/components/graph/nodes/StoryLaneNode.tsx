import Link from "next/link";
import type { Node, NodeProps } from "@xyflow/react";
import { STORY_STATUS_INK } from "@/components/story/status";

export type StoryLaneData = {
  storyId: string;
  title: string;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  /** How many tasks the lane below this holds, so a story can be
   *  recognised as empty without counting nodes that aren't there. */
  taskCount: number;
} & Record<string, unknown>;

export type StoryLaneNode = Node<StoryLaneData, "STORY_LANE">;

/**
 * The name of a story, above the lane its graph is drawn in.
 *
 * It is a node rather than an overlay so it rides the canvas's own
 * transform: a label positioned over the viewport would have to be
 * re-projected on every pan and zoom, and would drift from the lane it
 * names the moment either happened.
 *
 * A link, because the overview's job ends where a story's begins — you
 * come here to find which story the work is in, and then you go there.
 */
export function StoryLaneNode({ data }: NodeProps<StoryLaneNode>) {
  return (
    <Link
      href={`/stories/${data.storyId}`}
      className="nodrag nopan flex w-max max-w-[28rem] items-center gap-2 rounded-lg border border-border bg-surface/80 px-3 py-1.5 transition-colors hover:border-accent"
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${
          STORY_STATUS_INK[data.status] ?? "text-text-muted"
        }`}
      />
      <span className="truncate text-sm font-semibold text-text">
        {data.title}
      </span>
      <span className="shrink-0 text-[10px] tracking-[0.14em] text-text-faint uppercase">
        {data.taskCount === 0
          ? "Empty"
          : `${data.taskCount} ${data.taskCount === 1 ? "task" : "tasks"}`}
      </span>
    </Link>
  );
}
