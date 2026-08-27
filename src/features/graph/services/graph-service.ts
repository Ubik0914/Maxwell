import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import * as nodeRepository from "@/repositories/node.repository";
import * as edgeRepository from "@/repositories/edge.repository";
import { getCurrentFrontier } from "@/domain/graph/frontier";
import { validateConnection, type ValidationError } from "@/domain/graph/connection";
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

export interface ConnectNodesInput {
  storyId: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export type ConnectNodesResult =
  | { success: true; edge: GraphEdge }
  | { success: false; error: ValidationError };

/**
 * Validates the proposed edge against the DAG rules (Phase 13) before
 * inserting it. The DB's own UNIQUE/CHECK constraints are only a
 * fallback for a race between this read and the insert — this is the
 * actual authority on self-edge/duplicate/START/GOAL/cycle rejection.
 */
export async function connectNodes(
  supabase: Client,
  input: ConnectNodesInput,
): Promise<ConnectNodesResult> {
  const [nodes, edges] = await Promise.all([
    nodeRepository.findByStoryId(supabase, input.storyId),
    edgeRepository.findByStoryId(supabase, input.storyId),
  ]);

  const validation = validateConnection(
    input.sourceNodeId,
    input.targetNodeId,
    nodes,
    edges,
  );

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const edge = await edgeRepository.createEdge(supabase, input);
  return { success: true, edge };
}
