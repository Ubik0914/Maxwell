import { StoryShellSkeleton } from "@/components/story/StoryShellSkeleton";
import { TaskListSkeleton } from "@/components/story/TaskListSkeleton";

/** Shown while every story's tasks are fetched. */
export default function AllStoriesListLoading() {
  return (
    <StoryShellSkeleton>
      <TaskListSkeleton />
    </StoryShellSkeleton>
  );
}
