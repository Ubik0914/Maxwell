import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import * as nodeRepository from "@/repositories/node.repository";
import * as edgeRepository from "@/repositories/edge.repository";
import * as storyRepository from "@/repositories/story.repository";
import { getCurrentFrontier } from "@/domain/graph/frontier";
import { validateConnection, type ValidationError } from "@/domain/graph/connection";
import {
  calculateTaskAvailability,
  recalculateDownstream,
} from "@/domain/graph/availability";
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
  const allEdges = [...edges, edge];

  // A new edge can retroactively un-satisfy its target if the target
  // was already DONE/IN_PROGRESS from a previously-empty or -satisfied
  // incoming set (e.g. it had no dependencies until now, or this is a
  // second dependency that isn't met) - and that can cascade further
  // downstream too.
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const affected = recalculateDownstream(input.sourceNodeId, nodes, allEdges);
  for (const node of affected) {
    if (node.status) {
      const saved = await nodeRepository.updateStatus(
        supabase,
        node.id,
        node.status,
      );
      nodesById.set(saved.id, saved);
    }
  }

  // A demotion above can un-satisfy GOAL if it landed on one of its
  // direct sources - re-derive Story Completion the same way
  // changeTaskStatus does, so the story doesn't stay COMPLETED past a
  // dependency this edge just invalidated.
  const storyStatus = await storyRepository.getStatus(supabase, input.storyId);
  if (storyStatus && storyStatus !== "ARCHIVED" && affected.length > 0) {
    const nextStoryStatus = calculateStoryStatus(
      [...nodesById.values()],
      allEdges,
    );
    if (nextStoryStatus !== storyStatus) {
      await storyRepository.updateStatus(
        supabase,
        input.storyId,
        nextStoryStatus,
      );
    }
  }

  return { success: true, edge };
}

export interface InsertTaskOnEdgeInput {
  edgeId: string;
  title: string;
  description?: string;
}

/**
 * Splits an existing A->B edge into A->NewTask->B (the RPC is one
 * atomic transaction for the delete+insert+insert+insert). The new
 * task's own initial status is computed correctly by the RPC itself
 * (READY only if its source is actually satisfied), but B's status can
 * still go stale here: if B was DONE/IN_PROGRESS because A was DONE,
 * it now depends on NewTask instead - which never starts DONE - so it
 * needs the same downstream recalculation as a manually-created edge.
 */
export async function insertTaskOnEdge(
  supabase: Client,
  input: InsertTaskOnEdgeInput,
): Promise<string> {
  const newNodeId = await edgeRepository.insertTaskOnEdge(supabase, input);

  const newNode = await nodeRepository.findById(supabase, newNodeId);
  if (!newNode) return newNodeId;

  const [nodes, edges] = await Promise.all([
    nodeRepository.findByStoryId(supabase, newNode.storyId),
    edgeRepository.findByStoryId(supabase, newNode.storyId),
  ]);

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const affected = recalculateDownstream(newNodeId, nodes, edges);
  for (const node of affected) {
    if (node.status) {
      const saved = await nodeRepository.updateStatus(
        supabase,
        node.id,
        node.status,
      );
      nodesById.set(saved.id, saved);
    }
  }

  if (affected.length > 0) {
    const storyStatus = await storyRepository.getStatus(
      supabase,
      newNode.storyId,
    );
    if (storyStatus && storyStatus !== "ARCHIVED") {
      const nextStoryStatus = calculateStoryStatus(
        [...nodesById.values()],
        edges,
      );
      if (nextStoryStatus !== storyStatus) {
        await storyRepository.updateStatus(
          supabase,
          newNode.storyId,
          nextStoryStatus,
        );
      }
    }
  }

  return newNodeId;
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
 * Applies a manual status change, then recalculates every downstream
 * TASK node whose dependency-derived state may now be stale (see
 * recalculateDownstream) - not just direct children: a demotion can
 * itself invalidate further descendants.
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

  if (input.status === "IN_PROGRESS" || input.status === "DONE") {
    const [nodesBefore, edgesBefore] = await Promise.all([
      nodeRepository.findByStoryId(supabase, current.storyId),
      edgeRepository.findByStoryId(supabase, current.storyId),
    ]);

    // Checked against the true dependency-derived availability, not the
    // stored status field: a task's stored status can itself be stale
    // (e.g. a dependency reverted after this task was already READY),
    // so trusting it here would let the same TASK_BLOCKED guard be
    // sidestepped by going through READY first.
    if (
      calculateTaskAvailability(current.id, nodesBefore, edgesBefore) ===
      "BLOCKED"
    ) {
      return {
        success: false,
        error: {
          code: "TASK_BLOCKED",
          message: "Complete the blocking tasks before starting this task.",
        },
      };
    }
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

  const affectedTasks: GraphNode[] = [];
  const nodesById = new Map(allNodes.map((node) => [node.id, node]));
  nodesById.set(updated.id, updated);
  for (const node of recalculateDownstream(updated.id, allNodes, allEdges)) {
    if (node.status) {
      const saved = await nodeRepository.updateStatus(
        supabase,
        node.id,
        node.status,
      );
      affectedTasks.push(saved);
      nodesById.set(saved.id, saved);
    }
  }
  // Reflects `updated` and every recalculated node's new status, so
  // Story Completion below (which can depend on any of them, not just
  // `updated`) never judges against pre-recalculation data.
  const currentNodes = [...nodesById.values()];

  // Story Completion: re-derive ACTIVE/COMPLETED from the current graph.
  // Never touches an ARCHIVED story — Archive is a separate, user-driven
  // state outside the DAG-completion rule's business.
  let storyStatus = await storyRepository.getStatus(supabase, updated.storyId);
  if (storyStatus && storyStatus !== "ARCHIVED") {
    const nextStoryStatus = calculateStoryStatus(currentNodes, allEdges);
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
