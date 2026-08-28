import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { GraphNode, TaskStatus } from "@/domain/graph/types";

type Client = SupabaseClient<Database, "dag">;
type NodeRow = Database["dag"]["Tables"]["nodes"]["Row"];

function toGraphNode(row: NodeRow): GraphNode {
  return {
    id: row.id,
    storyId: row.story_id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    assigneeId: row.assignee_id,
    priority: row.priority as GraphNode["priority"],
    dueDate: row.due_date,
    positionX: row.position_x,
    positionY: row.position_y,
    sortOrder: row.sort_order,
  };
}

/**
 * Rewrites a story's manual order from a complete list of ids.
 *
 * The whole order goes over rather than the one row that moved: the
 * client then never has to reason about what its neighbours currently
 * are, and two people reordering at once end up with one of their two
 * orders instead of an interleaving of both. The RPC checks every id
 * belongs to the story and renumbers in a single transaction.
 */
export async function reorderNodes(
  supabase: Client,
  storyId: string,
  nodeIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc("reorder_nodes", {
    p_story_id: storyId,
    p_node_ids: nodeIds,
  });

  if (error) throw error;
}

export async function findById(
  supabase: Client,
  id: string,
): Promise<GraphNode | null> {
  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toGraphNode(data) : null;
}

export async function findByStoryId(
  supabase: Client,
  storyId: string,
): Promise<GraphNode[]> {
  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .eq("story_id", storyId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(toGraphNode);
}

export interface CreateTaskInput {
  storyId: string;
  title: string;
  description?: string;
  positionX: number;
  positionY: number;
}

/**
 * A newly created task always starts READY: it has no incoming edges yet
 * (it isn't connected to anything), so the BLOCKED/READY dependency rule
 * (Phase 14) trivially resolves to READY.
 */
export async function createTask(
  supabase: Client,
  input: CreateTaskInput,
): Promise<GraphNode> {
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      story_id: input.storyId,
      type: "TASK",
      title: input.title,
      description: input.description ?? null,
      status: "READY",
      position_x: input.positionX,
      position_y: input.positionY,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toGraphNode(data);
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  priority?: number | null;
  dueDate?: string | null;
}

/** Status is deliberately not settable here — only the Status Engine
 * (Phase 14, updateTaskStatusAction) may change dependency-derived state. */
export async function updateTask(
  supabase: Client,
  id: string,
  input: UpdateTaskInput,
): Promise<GraphNode> {
  const patch: Database["dag"]["Tables"]["nodes"]["Update"] = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.assigneeId !== undefined) patch.assignee_id = input.assigneeId;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;

  const { data, error } = await supabase
    .from("nodes")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return toGraphNode(data);
}

/** Incoming/outgoing edges cascade-delete via the edges FK (ON DELETE CASCADE). */
export async function deleteNode(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase.from("nodes").delete().eq("id", id);
  if (error) throw error;
}

export async function updatePosition(
  supabase: Client,
  id: string,
  x: number,
  y: number,
): Promise<void> {
  const { error } = await supabase
    .from("nodes")
    .update({ position_x: x, position_y: y })
    .eq("id", id);

  if (error) throw error;
}

export async function updateStatus(
  supabase: Client,
  id: string,
  status: TaskStatus,
): Promise<GraphNode> {
  const { data, error } = await supabase
    .from("nodes")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return toGraphNode(data);
}
