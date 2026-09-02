import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { setRoutineCompletionSchema } from "@/lib/validation/routine";
import * as routineRepository from "@/repositories/routine.repository";

/**
 * One day of one routine, set to done or not done.
 *
 * A PUT rather than a POST-and-DELETE pair: the caller is stating what
 * the day should look like, not asking for a change to be applied, so
 * sending the same body twice leaves the same one row behind.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ routineId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { routineId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = setRoutineCompletionSchema.safeParse({ routineId, ...body });
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    await routineRepository.setCompletion(supabase, {
      ...parsed.data,
      userId: user.id,
    });
    return apiSuccess(null);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to save completion.");
  }
}
