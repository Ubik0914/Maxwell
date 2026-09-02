import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { createRoutineSchema } from "@/lib/validation/routine";
import { parseIsoDate } from "@/lib/date/calendar";
import { todayIso } from "@/app/stories/[storyId]/story-data";
import * as routineRepository from "@/repositories/routine.repository";

export async function GET(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      "workspaceId query parameter is required.",
    );
  }

  // `date` is how a caller says which day it is where they are — the
  // streak and the done/not-done are both read against it. Left off,
  // it is UTC's today, which is the best a server can do alone.
  const date = request.nextUrl.searchParams.get("date");
  if (date !== null && parseIsoDate(date) === null) {
    return apiError(ErrorCode.VALIDATION_ERROR, "date must be YYYY-MM-DD.");
  }

  try {
    const routines = await routineRepository.listRoutinesForWorkspace(
      supabase,
      workspaceId,
      date ?? todayIso(),
    );
    return apiSuccess(routines);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to load routines.");
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    const id = await routineRepository.createRoutine(supabase, {
      ...parsed.data,
      createdBy: user.id,
    });
    return apiSuccess({ id }, 201);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to create routine.");
  }
}
