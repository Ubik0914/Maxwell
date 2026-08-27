import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { GraphNode } from "@/domain/graph/types";

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
  };
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
