import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import * as nodeRepository from "@/repositories/node.repository";
import * as edgeRepository from "@/repositories/edge.repository";
import { getCurrentFrontier } from "@/domain/graph/frontier";
import type { GraphNode, GraphEdge } from "@/domain/graph/types";

type Client = SupabaseClient<Database, "dag">;

export interface StoryStats {
  done: number;
  ready: number;
  inProgress: number;
  blocked: number;
}

export interface GraphResult {
  story: {
    id: string;
    title: string;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: StoryStats;
  frontier: GraphNode[];
}

function computeStats(nodes: GraphNode[]): StoryStats {
  const stats: StoryStats = { done: 0, ready: 0, inProgress: 0, blocked: 0 };

  for (const node of nodes) {
    if (node.type !== "TASK") continue;

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

  return stats;
}

/**
 * Loads a story's full graph (nodes + edges) plus derived stats and the
 * current frontier. Shared by the Story Graph Server Component (Phase 10)
 * and the REST API (Phase 17) so both surfaces return the same shape.
 */
export async function getGraph(
  supabase: Client,
  storyId: string,
): Promise<GraphResult | null> {
  const { data: story, error } = await supabase
    .from("stories")
    .select("id, title, status")
    .eq("id", storyId)
    .maybeSingle();

  if (error) throw error;
  if (!story) return null;

  const [nodes, edges] = await Promise.all([
    nodeRepository.findByStoryId(supabase, storyId),
    edgeRepository.findByStoryId(supabase, storyId),
  ]);

  return {
    story,
    nodes,
    edges,
    stats: computeStats(nodes),
    frontier: getCurrentFrontier(nodes),
  };
}
