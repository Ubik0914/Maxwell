import { StoryShellSkeleton } from "@/components/story/StoryShellSkeleton";
import { TaskBoardSkeleton } from "@/components/story/TaskBoardSkeleton";

/** Shown while a story's board is fetched. */
export default function StoryBoardLoading() {
  return (
    <StoryShellSkeleton>
      <TaskBoardSkeleton />
    </StoryShellSkeleton>
  );
}
