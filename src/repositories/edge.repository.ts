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
