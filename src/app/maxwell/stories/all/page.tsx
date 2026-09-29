import { AllStoriesShell } from "@/components/story/AllStoriesShell";
import { AllStoriesGraph } from "@/components/graph/AllStoriesGraph";
import { loadAllStories } from "@/app/maxwell/stories/all/all-data";
import { todayIso } from "@/app/maxwell/stories/[storyId]/story-data";

export default async function AllStoriesGraphPage() {
  const { graph, userEmail } = await loadAllStories();

  return (
    <AllStoriesShell graph={graph} userEmail={userEmail}>
      <div className="graph-enter min-h-0 flex-1">
        <AllStoriesGraph stories={graph.stories} today={todayIso()} />
      </div>
    </AllStoriesShell>
  );
}
