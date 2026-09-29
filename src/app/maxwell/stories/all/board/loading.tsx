import { StoryShellSkeleton } from "@/components/story/StoryShellSkeleton";
import { TaskBoardSkeleton } from "@/components/story/TaskBoardSkeleton";

/** Shown while every story's tasks are fetched. */
export default function AllStoriesBoardLoading() {
  return (
    <StoryShellSkeleton>
      <TaskBoardSkeleton />
    </StoryShellSkeleton>
  );
}
