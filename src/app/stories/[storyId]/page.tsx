import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGraph } from "@/features/graph/services/graph-service";
import { StoryHeader } from "@/components/story/StoryHeader";
import { StoryGraph } from "@/components/graph/StoryGraph";

export default async function StoryGraphPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const graph = await getGraph(supabase, storyId);

  if (!graph) {
    notFound();
  }

  // The screen *is* the graph here: a thin instrument strip on top, and
  // everything else given to the canvas. min-h-0 is what stops the flex
  // child from being sized by its content and pushing the header off.
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <StoryHeader
        story={graph.story}
        stats={graph.stats}
        frontierCount={graph.frontier.length}
      />
      <div className="graph-enter min-h-0 flex-1">
        <StoryGraph
          nodes={graph.nodes}
          edges={graph.edges}
          storyId={graph.story.id}
        />
      </div>
    </div>
  );
}
