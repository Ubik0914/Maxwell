import { AllStoriesShell } from "@/components/story/AllStoriesShell";
import { TaskBoard } from "@/components/task/TaskBoard";
import {
  loadAllStories,
  storyTitles,
} from "@/app/maxwell/stories/all/all-data";
import { todayIso } from "@/app/maxwell/stories/[storyId]/story-data";

export default async function AllStoriesBoardPage() {
  const { graph, userEmail } = await loadAllStories();

  return (
    <AllStoriesShell graph={graph} userEmail={userEmail}>
      <div className="min-h-0 flex-1">
        <TaskBoard
          scope={{ kind: "workspace", storyTitles: storyTitles(graph) }}
          today={todayIso()}
        />
      </div>
    </AllStoriesShell>
  );
}
