import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import * as nodeRepository from "@/repositories/node.repository";
import * as edgeRepository from "@/repositories/edge.repository";
import * as storyRepository from "@/repositories/story.repository";
import { getCurrentFrontier } from "@/domain/graph/frontier";
import { validateConnection, type ValidationError } from "@/domain/graph/connection";
import { calculateTaskAvailability } from "@/domain/graph/availability";
import { calculateStoryStatus } from "@/domain/graph/story-status";
import type { GraphNode, GraphEdge, TaskStatus } from "@/domain/graph/types";

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

export interface ChangeTaskStatusInput {
  taskId: string;
  status: TaskStatus;
}

export interface StatusChangeError {
  code: "TASK_NOT_FOUND" | "TASK_BLOCKED";
  message: string;
}

export type ChangeTaskStatusResult =
  | {
      success: true;
      task: GraphNode;
      affectedTasks: GraphNode[];
      storyStatus: "ACTIVE" | "COMPLETED" | "ARCHIVED";
    }
  | { success: false; error: StatusChangeError };

/**
 * Applies a manual status change, then recalculates the direct
 * downstream TASK nodes that are still in a dependency-derived state
 * (READY/BLOCKED — a node the user already moved to IN_PROGRESS/DONE/
 * CANCELLED is left alone). A single downstream pass is enough: only a
 * transition to DONE can newly satisfy a dependency, and satisfaction
 * only cares about DONE, not READY/BLOCKED, so the effect never needs
 * to cascade past direct children.
 */
export async function changeTaskStatus(
  supabase: Client,
  input: ChangeTaskStatusInput,
): Promise<ChangeTaskStatusResult> {
  const current = await nodeRepository.findById(supabase, input.taskId);

  if (!current || current.type !== "TASK") {
    return {
      success: false,
      error: { code: "TASK_NOT_FOUND", message: "Task not found." },
    };
  }

  if (input.status === "IN_PROGRESS" && current.status === "BLOCKED") {
    return {
      success: false,
      error: {
        code: "TASK_BLOCKED",
        message: "Complete the blocking tasks before starting this task.",
      },
    };
  }

  const updated = await nodeRepository.updateStatus(
    supabase,
    input.taskId,
    input.status,
  );

  const [allNodes, allEdges] = await Promise.all([
    nodeRepository.findByStoryId(supabase, updated.storyId),
    edgeRepository.findByStoryId(supabase, updated.storyId),
  ]);

  const outgoingTargetIds = allEdges
    .filter((edge) => edge.sourceNodeId === updated.id)
    .map((edge) => edge.targetNodeId);

  const affectedTasks: GraphNode[] = [];

  for (const targetId of outgoingTargetIds) {
    const target = allNodes.find((node) => node.id === targetId);
    if (!target || target.type !== "TASK") continue;
    if (target.status !== "READY" && target.status !== "BLOCKED") continue;

    const nextStatus = calculateTaskAvailability(
      target.id,
      allNodes,
      allEdges,
    );
    if (nextStatus !== target.status) {
      const saved = await nodeRepository.updateStatus(
        supabase,
        target.id,
        nextStatus,
      );
      affectedTasks.push(saved);
    }
  }

  // Story Completion: re-derive ACTIVE/COMPLETED from the current graph.
  // Never touches an ARCHIVED story — Archive is a separate, user-driven
  // state outside the DAG-completion rule's business.
  let storyStatus = await storyRepository.getStatus(supabase, updated.storyId);
  if (storyStatus && storyStatus !== "ARCHIVED") {
    const nextStoryStatus = calculateStoryStatus(allNodes, allEdges);
    if (nextStoryStatus !== storyStatus) {
      await storyRepository.updateStatus(
        supabase,
        updated.storyId,
        nextStoryStatus,
      );
      storyStatus = nextStoryStatus;
    }
  }

  return {
    success: true,
    task: updated,
    affectedTasks,
    storyStatus: storyStatus ?? "ACTIVE",
  };
}
