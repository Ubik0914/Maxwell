import { StoryShell } from "@/components/story/StoryShell";
import { TaskTable } from "@/components/task/TaskTable";
import { loadStory, todayIso } from "@/app/stories/[storyId]/story-data";

export default async function StoryListPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const { graph, userEmail } = await loadStory(storyId);

  return (
    <StoryShell graph={graph} userEmail={userEmail}>
      <div className="min-h-0 flex-1">
        <TaskTable
          nodes={graph.nodes}
          edges={graph.edges}
          storyId={graph.story.id}
          today={todayIso()}
        />
      </div>
    </StoryShell>
  );
}
