import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database, "dag">;

export interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  /** How many stories stand on this shelf. Counted, never stored. */
  storyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

function toDetail(
  row: Database["dag"]["Tables"]["projects"]["Row"],
): ProjectDetail {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    archived: row.archived_at !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Every project in the workspace, each with the number of stories on it.
 *
 * Two queries rather than a join with a count: the second one asks only
 * for project_id, over rows RLS has already narrowed to this person's
 * workspaces, and tallying them here keeps the count where every other
 * tally in this codebase lives — derived at read time, so it cannot
 * drift from the stories it claims to describe.
 */
export async function listProjectsForWorkspace(
  supabase: Client,
  workspaceId: string,
): Promise<ProjectListItem[]> {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (projects.length === 0) return [];

  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("project_id")
    .eq("workspace_id", workspaceId)
    .not("project_id", "is", null);

  if (storiesError) throw storiesError;

  const countByProject = new Map<string, number>();
  for (const story of stories) {
    if (!story.project_id) continue;
    countByProject.set(
      story.project_id,
      (countByProject.get(story.project_id) ?? 0) + 1,
    );
  }

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    archived: project.archived_at !== null,
    storyCount: countByProject.get(project.id) ?? 0,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  }));
}

export interface CreateProjectInput {
  workspaceId: string;
  name: string;
  description?: string;
  createdBy: string;
}

export async function createProject(
  supabase: Client,
  input: CreateProjectInput,
): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      description: input.description ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function findById(
  supabase: Client,
  id: string,
): Promise<ProjectDetail | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toDetail(data) : null;
}

export interface ProjectPatch {
  name?: string;
  description?: string | null;
  archived?: boolean;
}

export async function updateProject(
  supabase: Client,
  id: string,
  patch: ProjectPatch,
): Promise<ProjectDetail> {
  const update: Database["dag"]["Tables"]["projects"]["Update"] = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  // A boolean on the way in, a moment on the way down: "archived" is
  // the question anyone asks, but when it happened is worth keeping.
  if (patch.archived !== undefined) {
    update.archived_at = patch.archived ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return toDetail(data);
}

/**
 * Removes the shelf, leaving the stories standing.
 *
 * stories.project_id is nulled by the foreign key
 * (ON DELETE SET NULL (project_id)), so nothing here has to remember
 * to do it — and nothing can forget.
 */
export async function deleteProject(
  supabase: Client,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}
