import { StoryShell } from "@/components/story/StoryShell";
import { StoryGraph } from "@/components/graph/StoryGraph";
import { loadStory } from "@/app/stories/[storyId]/story-data";

export default async function StoryGraphPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const graph = await loadStory(storyId);

  // The screen *is* the graph here: a thin instrument strip on top, and
  // everything else given to the canvas. min-h-0 is what stops the flex
  // child from being sized by its content and pushing the header off.
  return (
    <StoryShell graph={graph}>
      <div className="graph-enter min-h-0 flex-1">
        <StoryGraph
          nodes={graph.nodes}
          edges={graph.edges}
          storyId={graph.story.id}
        />
      </div>
    </StoryShell>
  );
}
