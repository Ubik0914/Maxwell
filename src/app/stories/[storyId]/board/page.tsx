import { StoryHeader } from "@/components/story/StoryHeader";
import { TaskBoard } from "@/components/task/TaskBoard";
import { loadStory, todayIso } from "@/app/stories/[storyId]/story-data";

export default async function StoryBoardPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const graph = await loadStory(storyId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <StoryHeader
        story={graph.story}
        stats={graph.stats}
        frontierCount={graph.frontier.length}
      />
      <div className="min-h-0 flex-1">
        <TaskBoard
          nodes={graph.nodes}
          edges={graph.edges}
          today={todayIso()}
        />
      </div>
    </div>
  );
}
