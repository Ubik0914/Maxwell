import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database, "dag">;

export interface StoryStats {
  done: number;
  ready: number;
  inProgress: number;
  blocked: number;
  cancelled: number;
}

/** A task that could be picked up right now, for a card to name. */
export interface StoryFrontierTask {
  id: string;
  title: string;
  status: "READY" | "IN_PROGRESS";
  dueDate: string | null;
}

export interface StoryListItem {
  id: string;
  title: string;
  /** Carried so a card can open story settings without fetching the
   *  story again for one column. */
  description: string | null;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  /** The GOAL node's state — what the story is aiming at. */
  goal: string | null;
  stats: StoryStats;
  /** In progress first, then ready; soonest due first. Capped, because
   *  a card names what is live rather than listing the story. */
  frontier: StoryFrontierTask[];
}

function emptyStats(): StoryStats {
  return { done: 0, ready: 0, inProgress: 0, blocked: 0, cancelled: 0 };
}

/** How many frontier tasks a card will name before it stops. */
const FRONTIER_SHOWN = 4;

/**
 * What to work on next, in the order a person would pick it.
 *
 * Started work comes before unstarted — finishing something half-done
 * beats opening something new — and within each, whatever is due
 * soonest. A task with no due date is not urgent by omission, so it
 * sorts after the dated ones rather than before them.
 */
function byUrgency(a: StoryFrontierTask, b: StoryFrontierTask): number {
  if (a.status !== b.status) return a.status === "IN_PROGRESS" ? -1 : 1;
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

export async function listStoriesForWorkspace(
  supabase: Client,
  workspaceId: string,
): Promise<StoryListItem[]> {
  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("id, title, description, status, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (storiesError) throw storiesError;
  if (stories.length === 0) return [];

  const storyIds = stories.map((s) => s.id);
  // The same one round trip as before, asking for a few more columns:
  // what a card shows when it is opened is drawn from the nodes it was
  // already counting, so expanding one costs nothing.
  const { data: nodes, error: nodesError } = await supabase
    .from("nodes")
    .select("id, story_id, type, status, title, due_date")
    .in("type", ["TASK", "GOAL"])
    .in("story_id", storyIds);

  if (nodesError) throw nodesError;

  const statsByStory = new Map<string, StoryStats>();
  const frontierByStory = new Map<string, StoryFrontierTask[]>();
  const goalByStory = new Map<string, string>();
  for (const storyId of storyIds) {
    statsByStory.set(storyId, emptyStats());
    frontierByStory.set(storyId, []);
  }

  for (const node of nodes) {
    if (node.type === "GOAL") {
      goalByStory.set(node.story_id, node.title);
      continue;
    }

    const stats = statsByStory.get(node.story_id);
    if (!stats) continue;

    // Ready and in progress are the two states you can act on, so they
    // are counted and also named — the rest are only counted.
    if (node.status === "READY" || node.status === "IN_PROGRESS") {
      if (node.status === "READY") stats.ready += 1;
      else stats.inProgress += 1;
      frontierByStory.get(node.story_id)?.push({
        id: node.id,
        title: node.title,
        status: node.status,
        dueDate: node.due_date,
      });
      continue;
    }

    switch (node.status) {
      case "DONE":
        stats.done += 1;
        break;
      case "BLOCKED":
        stats.blocked += 1;
        break;
      case "CANCELLED":
        stats.cancelled += 1;
        break;
      default:
        break;
    }
  }

  return stories.map((story) => ({
    id: story.id,
    title: story.title,
    description: story.description,
    status: story.status,
    createdAt: story.created_at,
    updatedAt: story.updated_at,
    goal: goalByStory.get(story.id) ?? null,
    stats: statsByStory.get(story.id) ?? emptyStats(),
    frontier: (frontierByStory.get(story.id) ?? [])
      .sort(byUrgency)
      .slice(0, FRONTIER_SHOWN),
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

export async function getStatus(
  supabase: Client,
  storyId: string,
): Promise<"ACTIVE" | "COMPLETED" | "ARCHIVED" | null> {
  const { data, error } = await supabase
    .from("stories")
    .select("status")
    .eq("id", storyId)
    .maybeSingle();

  if (error) throw error;
  return data?.status ?? null;
}

/** Never call with ARCHIVED — Story Completion only toggles ACTIVE/COMPLETED. */
export async function updateStatus(
  supabase: Client,
  storyId: string,
  status: "ACTIVE" | "COMPLETED",
): Promise<void> {
  const { error } = await supabase
    .from("stories")
    .update({ status })
    .eq("id", storyId);

  if (error) throw error;
}

export interface StoryDetail {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

export async function findById(
  supabase: Client,
  id: string,
): Promise<StoryDetail | null> {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    title: data.title,
    description: data.description,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export interface UpdateStoryInput {
  title?: string;
  description?: string | null;
}

export async function updateStory(
  supabase: Client,
  id: string,
  input: UpdateStoryInput,
): Promise<StoryDetail> {
  const patch: Database["dag"]["Tables"]["stories"]["Update"] = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;

  const { data, error } = await supabase
    .from("stories")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    title: data.title,
    description: data.description,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function archiveStory(
  supabase: Client,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("stories")
    .update({ status: "ARCHIVED" })
    .eq("id", id);

  if (error) throw error;
}

/** nodes/edges cascade-delete via their story_id FK (ON DELETE CASCADE). */
export async function deleteStory(
  supabase: Client,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("stories").delete().eq("id", id);
  if (error) throw error;
}
