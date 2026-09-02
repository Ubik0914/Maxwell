import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { updateTaskStatusSchema } from "@/lib/validation/task";
import * as graphService from "@/features/graph/services/graph-service";

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
  const parsed = updateTaskStatusSchema.safeParse({ taskId, ...body });
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid status",
    );
  }

  try {
    const result = await graphService.changeTaskStatus(supabase, parsed.data, user);
    if (!result.success) {
      return apiError(result.error.code, result.error.message);
    }
    return apiSuccess({
      task: result.task,
      affectedTasks: result.affectedTasks,
    });
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to update status.");
  }
}
