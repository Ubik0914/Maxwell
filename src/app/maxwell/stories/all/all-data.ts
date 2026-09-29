import { requireCurrentWorkspace } from "@/features/workspace/current-workspace";
import {
  getWorkspaceGraph,
  type WorkspaceGraphResult,
} from "@/features/graph/services/graph-service";

/**
 * Everything the three workspace-wide views need, loaded the same way
 * for all of them — the aggregate's answer to story-data's loadStory,
 * and for the same reason: graph, list and board must read one query or
 * they will eventually disagree about what the workspace contains.
 */
export interface AllStoriesPageData {
  graph: WorkspaceGraphResult;
  userEmail: string;
}

export async function loadAllStories(): Promise<AllStoriesPageData> {
  const { user, workspace, supabase } = await requireCurrentWorkspace();
  const graph = await getWorkspaceGraph(supabase, workspace);

  return { graph, userEmail: user.email ?? "" };
}

/** The story names the list and the board put beside each task. */
export function storyTitles(
  graph: WorkspaceGraphResult,
): ReadonlyMap<string, string> {
  return new Map(graph.stories.map((story) => [story.id, story.title]));
}
