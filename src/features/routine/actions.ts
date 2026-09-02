"use server";

import { createClient } from "@/lib/supabase/server";
import { ErrorCode } from "@/lib/errors/codes";
import {
  createRoutineSchema,
  setRoutineCompletionSchema,
  updateRoutineSchema,
} from "@/lib/validation/routine";
import * as routineRepository from "@/repositories/routine.repository";
import type { ActionResult } from "@/types/action-result";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function notLoggedIn<T>(): ActionResult<T> {
  return {
    success: false,
    error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
  };
}

function invalid<T>(message: string): ActionResult<T> {
  return {
    success: false,
    error: { code: ErrorCode.VALIDATION_ERROR, message },
  };
}

function failed<T>(message: string): ActionResult<T> {
  return {
    success: false,
    error: { code: ErrorCode.INTERNAL_ERROR, message },
  };
}

/**
 * The workspace's routines as of the caller's own today.
 *
 * The page renders a first copy on the server; this is what every
 * change after that reads, so a tick, an edit and a day rolling over
 * all arrive the same way.
 */
export async function listRoutinesAction(
  workspaceId: string,
  today: string,
): Promise<ActionResult<routineRepository.RoutineListItem[]>> {
  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  try {
    const routines = await routineRepository.listRoutinesForWorkspace(
      supabase,
      workspaceId,
      today,
    );
    return { success: true, data: routines };
  } catch {
    return failed("Failed to load routines.");
  }
}

export async function createRoutineAction(input: {
  workspaceId: string;
  title: string;
  description?: string;
  weekdays?: number;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createRoutineSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  try {
    const id = await routineRepository.createRoutine(supabase, {
      ...parsed.data,
      createdBy: user.id,
    });
    return { success: true, data: { id } };
  } catch {
    return failed("Failed to create routine.");
  }
}

export async function updateRoutineAction(input: {
  routineId: string;
  title?: string;
  description?: string | null;
  weekdays?: number;
  active?: boolean;
}): Promise<ActionResult<null>> {
  const parsed = updateRoutineSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  const { routineId, ...patch } = parsed.data;

  try {
    await routineRepository.updateRoutine(supabase, routineId, patch);
    return { success: true, data: null };
  } catch {
    return failed("Failed to save routine.");
  }
}

export async function deleteRoutineAction(
  routineId: string,
): Promise<ActionResult<null>> {
  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  try {
    await routineRepository.deleteRoutine(supabase, routineId);
    return { success: true, data: null };
  } catch {
    return failed("Failed to delete routine.");
  }
}

/**
 * Ticks or unticks one day.
 *
 * The date comes from the caller and is not second-guessed here: the
 * browser knows which day it is where the person is, and this process
 * only knows which day it is in UTC.
 */
export async function setRoutineCompletionAction(input: {
  routineId: string;
  date: string;
  done: boolean;
}): Promise<ActionResult<null>> {
  const parsed = setRoutineCompletionSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  try {
    await routineRepository.setCompletion(supabase, {
      ...parsed.data,
      userId: user.id,
    });
    return { success: true, data: null };
  } catch {
    return failed("Failed to save.");
  }
}
