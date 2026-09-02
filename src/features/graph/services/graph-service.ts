import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import * as nodeRepository from "@/repositories/node.repository";
import * as edgeRepository from "@/repositories/edge.repository";
import * as storyRepository from "@/repositories/story.repository";
import { getCurrentFrontier } from "@/domain/graph/frontier";
import { validateConnection, type ValidationError } from "@/domain/graph/connection";
import { validateBranch } from "@/domain/graph/branch";
import {
  calculateTaskAvailability,
  recalculateDownstream,
  recalculateFrom,
} from "@/domain/graph/availability";
import { calculateStoryStatus } from "@/domain/graph/story-status";
import { validateStatusChange } from "@/domain/graph/status-change";
import { notifyStatusChange } from "@/features/notifications/notify";
import type {
  GraphNode,
  GraphEdge,
  SettableStatus,
} from "@/domain/graph/types";

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
    /** Carried so the header can open story settings without a
     *  second round-trip for one column. */
    description: string | null;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  };
  /**
   * The workspace this story belongs to — read from the story rather
   * than from the workspace cookie, which is a hint about where you
   * were last and not a fact about what you are looking at. A link
   * straight into a story has to name the right workspace in the
   * drawer, and after a fresh login there is no cookie at all.
   */
  workspace: { id: string; name: string };
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
  // The workspace comes along the foreign key rather than in a query
  // of its own: it is one join on a row already being fetched.
  const { data: story, error } = await supabase
    .from("stories")
    .select("id, title, description, status, workspaces(id, name)")
    .eq("id", storyId)
    .maybeSingle();

  if (error) throw error;
  if (!story || !story.workspaces) return null;

  const [nodes, edges] = await Promise.all([
    nodeRepository.findByStoryId(supabase, storyId),
    edgeRepository.findByStoryId(supabase, storyId),
  ]);

  const { workspaces, ...storyRow } = story;

  return {
    story: storyRow,
    workspace: workspaces,
    nodes,
    edges,
    stats: computeStats(nodes),
    frontier: getCurrentFrontier(nodes),
  };
}

/**
 * Every story in a workspace at once, in the same shape one story
 * arrives in.
 *
 * The three views can draw the workspace because a story was never the
 * unit they actually needed — nodes and edges were, and a GraphNode
 * already says which story it belongs to. So this is getGraph with the
 * `story` singular swapped for the list of stories the nodes came from,
 * and the stats and frontier counted across all of them.
 */
export interface WorkspaceGraphResult {
  workspace: { id: string; name: string };
  /** Most recently touched first, the order the drawer lists them in. */
  stories: storyRepository.StoryLink[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: StoryStats;
  frontier: GraphNode[];
}

export async function getWorkspaceGraph(
  supabase: Client,
  workspace: { id: string; name: string },
): Promise<WorkspaceGraphResult> {
  const stories = await storyRepository.listStoryLinks(supabase, workspace.id);
  const storyIds = stories.map((story) => story.id);

  const [nodes, edges] = await Promise.all([
    nodeRepository.findByStoryIds(supabase, storyIds),
    edgeRepository.findByStoryIds(supabase, storyIds),
  ]);

  return {
    workspace,
    stories,
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

/**
 * Removes a connection, and re-derives what it was holding back.
 *
 * The deletion on its own was the whole operation for a long time, and
 * it left the graph saying something untrue: a task blocked by a
 * dependency that no longer exists stayed BLOCKED, with nothing on
 * screen to explain why. Every other edit to the shape of the graph
 * re-derives the states around it — this one has to as well.
 *
 * The target is what changed, not the source: it is the node that just
 * lost a prerequisite. recalculateDownstream starts from a node whose
 * own status moved and could not be used here, because by the time the
 * edge is gone the source no longer points at anything.
 */
export async function disconnectNodes(
  supabase: Client,
  edgeId: string,
): Promise<void> {
  const edge = await edgeRepository.findById(supabase, edgeId);
  if (!edge) return;

  const [nodes, edges] = await Promise.all([
    nodeRepository.findByStoryId(supabase, edge.storyId),
    edgeRepository.findByStoryId(supabase, edge.storyId),
  ]);

  await edgeRepository.deleteEdge(supabase, edgeId);

  await settle(
    supabase,
    edge.storyId,
    nodes,
    edges.filter((other) => other.id !== edgeId),
    [edge.targetNodeId],
  );
}

/**
 * Removes a task, and re-derives whatever was waiting behind it.
 *
 * Its connections go with it (the edges table cascades on the node's
 * foreign key), which is exactly why this is needed: every successor
 * silently loses a prerequisite, and without this they keep a BLOCKED
 * they can no longer be talked out of.
 */
export async function deleteTask(
  supabase: Client,
  taskId: string,
): Promise<void> {
  const task = await nodeRepository.findById(supabase, taskId);
  if (!task) return;

  const [nodes, edges] = await Promise.all([
    nodeRepository.findByStoryId(supabase, task.storyId),
    edgeRepository.findByStoryId(supabase, task.storyId),
  ]);

  const successors = edges
    .filter((edge) => edge.sourceNodeId === taskId)
    .map((edge) => edge.targetNodeId);

  await nodeRepository.deleteNode(supabase, taskId);

  await settle(
    supabase,
    task.storyId,
    nodes.filter((node) => node.id !== taskId),
    edges.filter(
      (edge) => edge.sourceNodeId !== taskId && edge.targetNodeId !== taskId,
    ),
    successors,
  );
}

/**
 * Writes back whatever re-deriving from `changed` moved, and then asks
 * the story whether it is still what it says it is.
 *
 * The second half matters as much as the first: unblocking a task can
 * put work back in front of a GOAL that had nothing left before it, and
 * a story that stayed COMPLETED past that would be the same kind of
 * stale claim this function exists to prevent.
 */
async function settle(
  supabase: Client,
  storyId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  changed: string[],
): Promise<void> {
  const settled = await applyAvailability(supabase, nodes, edges, changed);
  // Nothing moved, so nothing the story is derived from moved either —
  // true of every caller here, all of which change what a task waits
  // on rather than what the story contains. An import does contain new
  // work, which is why it settles the story itself.
  if (!settled) return;

  await settleStory(supabase, storyId, settled, edges);
}

/**
 * Re-derives availability from `changed`, writes back whatever moved,
 * and hands back the graph as it now stands — or null if nothing moved
 * at all.
 */
async function applyAvailability(
  supabase: Client,
  nodes: GraphNode[],
  edges: GraphEdge[],
  changed: string[],
): Promise<Map<string, GraphNode> | null> {
  const affected = recalculateFrom(changed, nodes, edges);
  if (affected.length === 0) return null;

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  for (const node of affected) {
    if (!node.status) continue;
    const saved = await nodeRepository.updateStatus(
      supabase,
      node.id,
      node.status,
    );
    nodesById.set(saved.id, saved);
  }

  return nodesById;
}

/** Asks the story whether it is still what it says it is. */
async function settleStory(
  supabase: Client,
  storyId: string,
  nodesById: Map<string, GraphNode>,
  edges: GraphEdge[],
): Promise<void> {
  const storyStatus = await storyRepository.getStatus(supabase, storyId);
  if (!storyStatus || storyStatus === "ARCHIVED") return;

  const nextStoryStatus = calculateStoryStatus([...nodesById.values()], edges);
  if (nextStoryStatus !== storyStatus) {
    await storyRepository.updateStatus(supabase, storyId, nextStoryStatus);
  }
}

export interface ImportTasksResult {
  nodeIds: string[];
}

/**
 * Adds a whole CSV's worth of tasks to a story.
 *
 * Two steps, and the order is the whole design. The RPC writes every
 * task and every dependency in one transaction and starts every task
 * READY; then the Status Engine is asked what the graph now means, and
 * the ones that turned out to be waiting on something become BLOCKED.
 *
 * The alternative — having the RPC work out each task's status as it
 * inserted — would put a second implementation of the availability
 * rules in PL/pgSQL, where it could disagree with the one in the domain
 * layer and where nothing would notice. There is one answer to "is this
 * task blocked", and it is not in SQL.
 *
 * Positions come from the caller, which has the layout and the ids it
 * is about to create; see planLayout in the import dialog.
 */
export async function importTasks(
  supabase: Client,
  storyId: string,
  rows: nodeRepository.ImportTaskInput[],
): Promise<ImportTasksResult> {
  const nodeIds = await nodeRepository.importTasks(supabase, storyId, rows);

  const [nodes, edges] = await Promise.all([
    nodeRepository.findByStoryId(supabase, storyId),
    edgeRepository.findByStoryId(supabase, storyId),
  ]);

  // Not settle(), which stops when no status moved. An import of tasks
  // that all turn out to be READY moves nothing and still changes what
  // the story is: there is work in front of the GOAL now where there
  // may have been none, and a story left saying COMPLETED would be
  // exactly the stale claim the rest of this file exists to prevent.
  const settled =
    (await applyAvailability(supabase, nodes, edges, nodeIds)) ??
    new Map(nodes.map((node) => [node.id, node]));

  await settleStory(supabase, storyId, settled, edges);
  return { nodeIds };
}

export interface InsertTaskOnEdgeInput {
  edgeId: string;
  title: string;
  description?: string;
}

export interface BranchTaskFromNodeInput {
  sourceNodeId: string;
  targetNodeId: string;
  title: string;
  description?: string;
}

/**
 * Splits an existing A->B edge into A->NewTask->B (the RPC is one
 * atomic transaction for the delete+insert+insert+insert).
 */
export async function insertTaskOnEdge(
  supabase: Client,
  input: InsertTaskOnEdgeInput,
): Promise<string> {
  const newNodeId = await edgeRepository.insertTaskOnEdge(supabase, input);
  await settleAfterSplice(supabase, newNodeId);
  return newNodeId;
}

/**
 * Adds a parallel A->NewTask->B beside an existing A->B, which stays.
 * The new task becomes a second prerequisite for B, rejoining the path
 * it branched from.
 */
export async function branchTaskOnEdge(
  supabase: Client,
  input: InsertTaskOnEdgeInput,
): Promise<string> {
  const newNodeId = await edgeRepository.branchTaskOnEdge(supabase, input);
  await settleAfterSplice(supabase, newNodeId);
  return newNodeId;
}

export type BranchFromNodeResult =
  | { success: true; nodeId: string }
  | { success: false; error: ValidationError };

/**
 * Branches from a node rather than from one of its edges: the caller
 * names both ends, so the new task can rejoin further downstream than
 * the next task along.
 *
 * That freedom is why this validates first and branchTaskOnEdge doesn't
 * have to — an edge's own endpoints are always a safe pair, but an
 * arbitrary one can be pointed back upstream, and the new task would
 * close a cycle. The RPC works on ids alone and can't see the shape of
 * the graph, so the check belongs here.
 */
export async function branchTaskFromNode(
  supabase: Client,
  input: BranchTaskFromNodeInput,
): Promise<BranchFromNodeResult> {
  const source = await nodeRepository.findById(supabase, input.sourceNodeId);
  if (!source) {
    return {
      success: false,
      error: {
        code: "NODE_NOT_FOUND",
        message: "One of the selected tasks no longer exists.",
      },
    };
  }

  const [nodes, edges] = await Promise.all([
    nodeRepository.findByStoryId(supabase, source.storyId),
    edgeRepository.findByStoryId(supabase, source.storyId),
  ]);

  const validation = validateBranch(
    input.sourceNodeId,
    input.targetNodeId,
    nodes,
    edges,
  );
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const newNodeId = await edgeRepository.branchTaskFromNode(supabase, input);
  await settleAfterSplice(supabase, newNodeId);
  return { success: true, nodeId: newNodeId };
}

/**
 * Brings the graph back into a consistent state after a node has been
 * spliced onto an edge, whichever way round.
 *
 * The new task's own initial status is computed correctly by the RPC
 * (READY only if its source is actually satisfied), but B's can go
 * stale either way: an insert makes B depend on NewTask instead of A,
 * and a branch gives B a second prerequisite on top of A — and NewTask
 * never starts DONE. So a B that was DONE/IN_PROGRESS has to fall back
 * to BLOCKED, exactly as it would for a manually-created edge, and the
 * story's own status follows from that.
 */
async function settleAfterSplice(
  supabase: Client,
  newNodeId: string,
): Promise<void> {
  const newNode = await nodeRepository.findById(supabase, newNodeId);
  if (!newNode) return;

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
}

export interface ChangeTaskStatusInput {
  taskId: string;
  /** Never BLOCKED: that one is the engine's to assign, not a caller's. */
  status: SettableStatus;
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
  /**
   * Who is making the change. Only notifications use it, so it is
   * optional: a caller with no user in hand still gets its status
   * change, it just has nobody to tell about it.
   */
  actor?: { id: string },
): Promise<ChangeTaskStatusResult> {
  const current = await nodeRepository.findById(supabase, input.taskId);

  if (!current || current.type !== "TASK") {
    return {
      success: false,
      error: { code: "TASK_NOT_FOUND", message: "Task not found." },
    };
  }

  // Every move but Cancel is checked, Ready included — see
  // validateStatusChange. Ready is a fact about the graph rather than a
  // wish, and the engine grants it on its own the moment the last thing
  // in the way turns DONE.
  if (input.status !== "CANCELLED") {
    const [nodesBefore, edgesBefore] = await Promise.all([
      nodeRepository.findByStoryId(supabase, current.storyId),
      edgeRepository.findByStoryId(supabase, current.storyId),
    ]);

    // Judged on the true dependency-derived availability, not the
    // stored status field: a task's stored status can itself be stale
    // (e.g. a dependency reverted after this task was already READY),
    // so trusting it would let the guard be walked around.
    const verdict = validateStatusChange(
      input.status,
      calculateTaskAvailability(current.id, nodesBefore, edgesBefore),
    );
    if (!verdict.allowed) {
      return { success: false, error: verdict.error };
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
  let completed = false;
  if (storyStatus && storyStatus !== "ARCHIVED") {
    const nextStoryStatus = calculateStoryStatus(currentNodes, allEdges);
    if (nextStoryStatus !== storyStatus) {
      await storyRepository.updateStatus(
        supabase,
        updated.storyId,
        nextStoryStatus,
      );
      completed = nextStoryStatus === "COMPLETED";
      storyStatus = nextStoryStatus;
    }
  }

  // What the cascade freed, to whoever is not looking at it. Scheduled
  // rather than awaited, and unable to fail this call — see
  // notifyStatusChange.
  if (actor) {
    notifyStatusChange(supabase, {
      userId: actor.id,
      storyId: updated.storyId,
      affected: affectedTasks,
      completed,
    });
  }

  return {
    success: true,
    task: updated,
    affectedTasks,
    storyStatus: storyStatus ?? "ACTIVE",
  };
}
