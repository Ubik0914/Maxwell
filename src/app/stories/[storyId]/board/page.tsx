import { StoryShell } from "@/components/story/StoryShell";
import { TaskBoard } from "@/components/task/TaskBoard";
import { loadStory, todayIso } from "@/app/stories/[storyId]/story-data";

export default async function StoryBoardPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const { graph, userEmail } = await loadStory(storyId);

  return (
    <StoryShell graph={graph} userEmail={userEmail}>
      <div className="min-h-0 flex-1">
        <TaskBoard
          scope={{ kind: "story", storyId: graph.story.id }}
          today={todayIso()}
        />
      </div>
    </StoryShell>
  );
}
