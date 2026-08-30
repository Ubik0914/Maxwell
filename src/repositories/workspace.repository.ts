import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database, "dag">;

export interface WorkspaceMembership {
  workspaceId: string;
  name: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  /**
   * How many stories are in it.
   *
   * Here because deleting a workspace takes all of them, and "this will
   * delete 14 stories" is a warning somebody can weigh, where "this
   * cannot be undone" is a sentence they have read a hundred times.
   */
  storyCount: number;
}

export async function listWorkspacesForUser(
  supabase: Client,
  userId: string,
): Promise<WorkspaceMembership[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId);

  if (membershipError) throw membershipError;
  if (memberships.length === 0) return [];

  const workspaceIds = memberships.map((m) => m.workspace_id);
  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name")
    .in("id", workspaceIds);

  if (workspaceError) throw workspaceError;

  // One query and a tally rather than a count per workspace: the number
  // of workspaces someone belongs to is small, but a query each is a
  // round trip each.
  const { data: stories, error: storyError } = await supabase
    .from("stories")
    .select("workspace_id")
    .in("workspace_id", workspaceIds);

  if (storyError) throw storyError;

  const storyCounts = new Map<string, number>();
  for (const story of stories) {
    storyCounts.set(
      story.workspace_id,
      (storyCounts.get(story.workspace_id) ?? 0) + 1,
    );
  }

  const nameById = new Map(workspaces.map((w) => [w.id, w.name]));

  return memberships
    .map((m) => {
      const name = nameById.get(m.workspace_id);
      return name
        ? {
            workspaceId: m.workspace_id,
            name,
            role: m.role,
            storyCount: storyCounts.get(m.workspace_id) ?? 0,
          }
        : null;
    })
    .filter((m): m is WorkspaceMembership => m !== null);
}

export interface CreateWorkspaceInput {
  name: string;
  createdBy: string;
}

export async function createWorkspace(
  supabase: Client,
  input: CreateWorkspaceInput,
): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ name: input.name, created_by: input.createdBy })
    .select("id, name")
    .single();

  if (error) throw error;
  return data;
}

export interface AddWorkspaceMemberInput {
  workspaceId: string;
  userId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
}

export async function addWorkspaceMember(
  supabase: Client,
  input: AddWorkspaceMemberInput,
): Promise<void> {
  const { error } = await supabase.from("workspace_members").insert({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    role: input.role,
  });

  if (error) throw error;
}

/**
 * The stories in a workspace, ids only.
 *
 * For the things that have to be dealt with before the workspace goes
 * and takes them out of reach — see deleteTaskImages.
 */
export async function listStoryIds(
  supabase: Client,
  workspaceId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("stories")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (error) throw error;
  return data.map((story) => story.id);
}

/**
 * Stories, tasks, dependencies and memberships all go with it, by the
 * schema's own cascades. Only an OWNER may do this, which is decided by
 * the workspaces_delete policy rather than here: a check in this file
 * would be a second opinion that could drift from the one that counts.
 *
 * Returns whether a row actually went. RLS does not refuse a delete it
 * disallows — it simply has nothing to delete, and reports no error,
 * which would let an EDITOR be told their workspace was removed while
 * it sat there. So the deleted rows are asked for and counted.
 */
export async function deleteWorkspace(
  supabase: Client,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw error;
  return data.length > 0;
}

export async function isWorkspaceMember(
  supabase: Client,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}
