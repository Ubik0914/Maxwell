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

  return (
    <div className="flex h-screen flex-col bg-bg">
      <StoryHeader
        story={graph.story}
        stats={graph.stats}
        frontierCount={graph.frontier.length}
      />
      <div className="flex-1">
        <StoryGraph
          nodes={graph.nodes}
          edges={graph.edges}
          storyId={graph.story.id}
        />
      </div>
    </div>
  );
}
