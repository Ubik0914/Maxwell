"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createTaskSchema,
  updateTaskSchema,
  updateNodePositionSchema,
} from "@/lib/validation/task";
import { ErrorCode } from "@/lib/errors/codes";
import * as nodeRepository from "@/repositories/node.repository";
import type { ActionResult } from "@/types/action-result";

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
