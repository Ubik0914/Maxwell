import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database, "dag">;

export interface StoryStats {
  done: number;
  ready: number;
  inProgress: number;
  blocked: number;
}

export interface StoryListItem {
  id: string;
  title: string;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  updatedAt: string;
  stats: StoryStats;
}

function emptyStats(): StoryStats {
  return { done: 0, ready: 0, inProgress: 0, blocked: 0 };
}

export async function listStoriesForWorkspace(
  supabase: Client,
  workspaceId: string,
): Promise<StoryListItem[]> {
  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("id, title, status, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (storiesError) throw storiesError;
  if (stories.length === 0) return [];

  const storyIds = stories.map((s) => s.id);
  const { data: nodes, error: nodesError } = await supabase
    .from("nodes")
    .select("story_id, status")
    .eq("type", "TASK")
    .in("story_id", storyIds);

  if (nodesError) throw nodesError;

  const statsByStory = new Map<string, StoryStats>();
  for (const storyId of storyIds) {
    statsByStory.set(storyId, emptyStats());
  }

  for (const node of nodes) {
    const stats = statsByStory.get(node.story_id);
    if (!stats) continue;

    switch (node.status) {
      case "DONE":
        stats.done += 1;
        break;
      case "READY":
        stats.ready += 1;
        break;
      case "IN_PROGRESS":
        stats.inProgress += 1;
        break;
      case "BLOCKED":
        stats.blocked += 1;
        break;
      default:
        break;
    }
  }

  return stories.map((story) => ({
    id: story.id,
    title: story.title,
    status: story.status,
    updatedAt: story.updated_at,
    stats: statsByStory.get(story.id) ?? emptyStats(),
  }));
}

export interface CreateStoryInput {
  workspaceId: string;
  title: string;
  description?: string;
  startState: string;
  goalState: string;
}

/**
 * Creates the story together with its START/GOAL nodes and the
 * START -> GOAL edge as a single atomic operation via the dag.create_story
 * RPC (a PL/pgSQL function body is one transaction, so a failure partway
 * through rolls back everything — no "story without nodes" state).
 */
export async function createStory(
  supabase: Client,
  input: CreateStoryInput,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_story", {
    p_workspace_id: input.workspaceId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_start_state: input.startState,
    p_goal_state: input.goalState,
  });

  if (error) throw error;
  return data;
}
