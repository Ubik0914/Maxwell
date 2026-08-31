import { AllStoriesShell } from "@/components/story/AllStoriesShell";
import { TaskTable } from "@/components/task/TaskTable";
import { loadAllStories, storyTitles } from "@/app/stories/all/all-data";
import { todayIso } from "@/app/stories/[storyId]/story-data";

export default async function AllStoriesListPage() {
  const { graph, userEmail } = await loadAllStories();

  return (
    <AllStoriesShell graph={graph} userEmail={userEmail}>
      <div className="min-h-0 flex-1">
        <TaskTable
          scope={{ kind: "workspace", storyTitles: storyTitles(graph) }}
          today={todayIso()}
        />
      </div>
    </AllStoriesShell>
  );
}
