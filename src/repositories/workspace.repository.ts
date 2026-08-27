import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database, "dag">;

export interface WorkspaceMembership {
  workspaceId: string;
  name: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
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

  const nameById = new Map(workspaces.map((w) => [w.id, w.name]));

  return memberships
    .map((m) => {
      const name = nameById.get(m.workspace_id);
      return name
        ? { workspaceId: m.workspace_id, name, role: m.role }
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
