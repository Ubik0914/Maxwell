import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { GraphEdge } from "@/domain/graph/types";

type Client = SupabaseClient<Database, "dag">;
type EdgeRow = Database["dag"]["Tables"]["edges"]["Row"];

function toGraphEdge(row: EdgeRow): GraphEdge {
  return {
    id: row.id,
    storyId: row.story_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
  };
}

export async function findById(
  supabase: Client,
  id: string,
): Promise<GraphEdge | null> {
  const { data, error } = await supabase
    .from("edges")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toGraphEdge(data) : null;
}

export async function findByStoryId(
  supabase: Client,
  storyId: string,
): Promise<GraphEdge[]> {
  const { data, error } = await supabase
    .from("edges")
    .select("*")
    .eq("story_id", storyId);

  if (error) throw error;
  return data.map(toGraphEdge);
}

export interface CreateEdgeInput {
  storyId: string;
  sourceNodeId: string;
  targetNodeId: string;
}

/**
 * Plain insert only — DAG validation (self-edge, duplicate, START/GOAL
 * direction, cycle) is Phase 13's job, layered on top of this in
 * GraphService.connectNodes(). The DB's own UNIQUE(source, target) and
 * "source <> target" CHECK constraints still give baseline protection.
 */
export async function createEdge(
  supabase: Client,
  input: CreateEdgeInput,
): Promise<GraphEdge> {
  const { data, error } = await supabase
    .from("edges")
    .insert({
      story_id: input.storyId,
      source_node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toGraphEdge(data);
}

export async function deleteEdge(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase.from("edges").delete().eq("id", id);
  if (error) throw error;
}

export interface InsertTaskOnEdgeInput {
  edgeId: string;
  title: string;
  description?: string;
}

/** Delete edge + insert TASK node + insert two new edges, as one
 * transaction via the dag.insert_task_on_edge RPC. */
export async function insertTaskOnEdge(
  supabase: Client,
  input: InsertTaskOnEdgeInput,
): Promise<string> {
  const { data, error } = await supabase.rpc("insert_task_on_edge", {
    p_edge_id: input.edgeId,
    p_title: input.title,
    p_description: input.description ?? null,
  });

  if (error) throw error;
  return data;
}

/**
 * Insert TASK node + two new edges while KEEPING the original edge, as
 * one transaction via the dag.branch_task_on_edge RPC — a parallel path
 * A->NewTask->B beside the existing A->B, rather than a split.
 */
export async function branchTaskOnEdge(
  supabase: Client,
  input: InsertTaskOnEdgeInput,
): Promise<string> {
  const { data, error } = await supabase.rpc("branch_task_on_edge", {
    p_edge_id: input.edgeId,
    p_title: input.title,
    p_description: input.description ?? null,
  });

  if (error) throw error;
  return data;
}

export interface BranchTaskFromNodeInput {
  sourceNodeId: string;
  targetNodeId: string;
  title: string;
  description?: string;
}

/**
 * The same parallel splice as branchTaskOnEdge, but given its two
 * endpoints directly — so a branch can start at a node and rejoin
 * anywhere downstream, not only at whatever one edge happened to point
 * at. Cycle safety is checked in GraphService before this is called.
 */
export async function branchTaskFromNode(
  supabase: Client,
  input: BranchTaskFromNodeInput,
): Promise<string> {
  const { data, error } = await supabase.rpc("branch_task_from_node", {
    p_source_node_id: input.sourceNodeId,
    p_target_node_id: input.targetNodeId,
    p_title: input.title,
    p_description: input.description ?? null,
  });

  if (error) throw error;
  return data;
}
