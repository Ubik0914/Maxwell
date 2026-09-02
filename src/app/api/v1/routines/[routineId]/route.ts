import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { updateRoutineSchema } from "@/lib/validation/routine";
import * as routineRepository from "@/repositories/routine.repository";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ routineId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { routineId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateRoutineSchema.safeParse({ routineId, ...body });
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    const { routineId: id, ...patch } = parsed.data;
    await routineRepository.updateRoutine(supabase, id, patch);
    return apiSuccess(null);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to update routine.");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ routineId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { routineId } = await params;

  try {
    await routineRepository.deleteRoutine(supabase, routineId);
    return apiSuccess(null);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to delete routine.");
  }
}
