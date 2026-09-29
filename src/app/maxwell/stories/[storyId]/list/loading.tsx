import { StoryShellSkeleton } from "@/components/story/StoryShellSkeleton";
import { TaskListSkeleton } from "@/components/story/TaskListSkeleton";

/** Shown while a story's task list is fetched. */
export default function StoryListLoading() {
  return (
    <StoryShellSkeleton>
      <TaskListSkeleton />
    </StoryShellSkeleton>
  );
}
