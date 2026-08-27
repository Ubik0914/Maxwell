import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { updateTaskSchema } from "@/lib/validation/task";
import * as nodeRepository from "@/repositories/node.repository";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { taskId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse({ taskId, ...body });
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    const { taskId: id, ...patch } = parsed.data;
    const task = await nodeRepository.updateTask(supabase, id, patch);
    return apiSuccess(task);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to update task.");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { taskId } = await params;

  try {
    await nodeRepository.deleteNode(supabase, taskId);
    return apiSuccess(null);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to delete task.");
  }
}
