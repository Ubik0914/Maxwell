"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createTaskSchema,
  updateTaskSchema,
  updateNodePositionSchema,
  updateTaskStatusSchema,
  reorderTasksSchema,
} from "@/lib/validation/task";
import {
  branchTaskFromNodeSchema,
  createEdgeSchema,
  insertTaskOnEdgeSchema,
} from "@/lib/validation/edge";
import { ErrorCode } from "@/lib/errors/codes";
import * as nodeRepository from "@/repositories/node.repository";
import * as edgeRepository from "@/repositories/edge.repository";
import * as graphService from "@/features/graph/services/graph-service";
import type { ActionResult } from "@/types/action-result";
import type { GraphNode } from "@/domain/graph/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createTaskAction(
  _prevState: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const description = formData.get("description");

  const parsed = createTaskSchema.safeParse({
    storyId: formData.get("storyId"),
    title: formData.get("title"),
    description: description ? description : undefined,
    position: {
      x: Number(formData.get("x")),
      y: Number(formData.get("y")),
    },
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    const node = await nodeRepository.createTask(supabase, {
      storyId: parsed.data.storyId,
      title: parsed.data.title,
      description: parsed.data.description,
      positionX: parsed.data.position.x,
      positionY: parsed.data.position.y,
    });
    return { success: true, data: { id: node.id } };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to create task. Please try again.",
      },
    };
  }
}

export async function updateTaskAction(input: {
  taskId: string;
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  priority?: number | null;
  dueDate?: string | null;
}): Promise<ActionResult<null>> {
  const parsed = updateTaskSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  const { taskId, ...patch } = parsed.data;

  try {
    await nodeRepository.updateTask(supabase, taskId, patch);
    return { success: true, data: null };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to save changes.",
      },
    };
  }
}

export async function deleteTaskAction(
  taskId: string,
): Promise<ActionResult<null>> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    await nodeRepository.deleteNode(supabase, taskId);
    return { success: true, data: null };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to delete task.",
      },
    };
  }
}

export async function updateNodePositionAction(input: {
  nodeId: string;
  x: number;
  y: number;
}): Promise<ActionResult<null>> {
  const parsed = updateNodePositionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid position",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    await nodeRepository.updatePosition(
      supabase,
      parsed.data.nodeId,
      parsed.data.x,
      parsed.data.y,
    );
    return { success: true, data: null };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to save position.",
      },
    };
  }
}

export async function createEdgeAction(input: {
  storyId: string;
  sourceNodeId: string;
  targetNodeId: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createEdgeSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    const result = await graphService.connectNodes(supabase, parsed.data);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: { id: result.edge.id } };
  } catch (err) {
    // Fallback for a race between the validation read and the insert;
    // validateConnection() is the actual authority on these rejections.
    const message = err instanceof Error ? err.message : "";
    if (
      message.includes("edges_source_node_id_target_node_id_key") ||
      message.includes("duplicate key")
    ) {
      return {
        success: false,
        error: {
          code: ErrorCode.EDGE_ALREADY_EXISTS,
          message: "This connection already exists.",
        },
      };
    }
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to connect tasks.",
      },
    };
  }
}

export async function deleteEdgeAction(
  edgeId: string,
): Promise<ActionResult<null>> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    await edgeRepository.deleteEdge(supabase, edgeId);
    return { success: true, data: null };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to delete connection.",
      },
    };
  }
}

/**
 * The two things a connection's "+" can do, sharing everything but the
 * splice itself:
 *   insert — A->B becomes A->NewTask->B (the old edge goes)
 *   branch — A->NewTask->B is added beside A->B, which stays, so the
 *            new task is a parallel prerequisite rejoining at B
 */
export type EdgeSpliceMode = "insert" | "branch";

export async function insertTaskOnEdgeAction(input: {
  edgeId: string;
  title: string;
  description?: string;
  mode?: EdgeSpliceMode;
}): Promise<ActionResult<{ id: string }>> {
  const { mode = "insert", ...splice } = input;
  const parsed = insertTaskOnEdgeSchema.safeParse(splice);

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    const nodeId =
      mode === "branch"
        ? await graphService.branchTaskOnEdge(supabase, parsed.data)
        : await graphService.insertTaskOnEdge(supabase, parsed.data);
    return { success: true, data: { id: nodeId } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("EDGE_NOT_FOUND")) {
      return {
        success: false,
        error: {
          code: ErrorCode.EDGE_NOT_FOUND,
          message: "This connection no longer exists.",
        },
      };
    }
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message:
          mode === "branch"
            ? "Failed to branch this connection."
            : "Failed to insert task.",
      },
    };
  }
}

/**
 * Branching from a node: the new task runs parallel to whatever already
 * lies between `sourceNodeId` and `targetNodeId`, and rejoins there.
 * Unlike the edge route, the caller picks both ends, so GraphService
 * checks the pair for a cycle before anything is written.
 */
export async function branchTaskFromNodeAction(input: {
  sourceNodeId: string;
  targetNodeId: string;
  title: string;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = branchTaskFromNodeSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    const result = await graphService.branchTaskFromNode(
      supabase,
      parsed.data,
    );
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: { id: result.nodeId } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("NODE_NOT_FOUND")) {
      return {
        success: false,
        error: {
          code: ErrorCode.NODE_NOT_FOUND,
          message: "One of the selected tasks no longer exists.",
        },
      };
    }
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to branch from this task.",
      },
    };
  }
}

export async function updateTaskStatusAction(input: {
  taskId: string;
  status: "READY" | "IN_PROGRESS" | "DONE" | "CANCELLED";
}): Promise<
  ActionResult<{
    task: GraphNode;
    affectedTasks: GraphNode[];
    storyStatus: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  }>
> {
  const parsed = updateTaskStatusSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid status",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    const result = await graphService.changeTaskStatus(supabase, parsed.data);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      data: {
        task: result.task,
        affectedTasks: result.affectedTasks,
        storyStatus: result.storyStatus,
      },
    };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to update status.",
      },
    };
  }
}

export async function reorderTasksAction(input: {
  storyId: string;
  taskIds: string[];
}): Promise<ActionResult<null>> {
  const parsed = reorderTasksSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid order",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    await nodeRepository.reorderNodes(
      supabase,
      parsed.data.storyId,
      parsed.data.taskIds,
    );
    return { success: true, data: null };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to save the new order.",
      },
    };
  }
}
