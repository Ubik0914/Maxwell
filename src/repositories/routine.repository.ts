import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { shiftDate } from "@/lib/date/calendar";
import {
  HISTORY_WINDOW_DAYS,
  currentStreak,
  recentHistory,
  type HistoryDay,
} from "@/domain/routine/history";
import { EVERY_DAY, isDueOn } from "@/domain/routine/schedule";

type Client = SupabaseClient<Database, "dag">;

/** How many due days the row of marks shows. */
export const HISTORY_SHOWN = 7;

export interface RoutineListItem {
  id: string;
  title: string;
  description: string | null;
  /** The weekday bitmask — see domain/routine/schedule. */
  weekdays: number;
  active: boolean;
  /** Whether today is one of its days at all. */
  dueToday: boolean;
  doneToday: boolean;
  streak: number;
  /** The last few due days, oldest first. */
  history: HistoryDay[];
}

/**
 * Every routine in the workspace, with its record read against `today`.
 *
 * Two queries rather than one per routine: the log is fetched for all
 * of them at once over a fixed window and then split up here. The
 * window is the domain's, so the streak on screen never claims more
 * than the rows behind it.
 *
 * `today` is passed in rather than read from the clock, because the
 * only day that matters is the one the person asking is having, and
 * this code runs on a server that may be a day away from them.
 */
export async function listRoutinesForWorkspace(
  supabase: Client,
  workspaceId: string,
  today: string,
): Promise<RoutineListItem[]> {
  const { data: routines, error } = await supabase
    .from("routines")
    .select("id, title, description, weekdays, active, sort_order, created_at")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (routines.length === 0) return [];

  const since = shiftDate(today, -HISTORY_WINDOW_DAYS) ?? today;
  const { data: completions, error: completionsError } = await supabase
    .from("routine_completions")
    .select("routine_id, on_date")
    .in(
      "routine_id",
      routines.map((routine) => routine.id),
    )
    .gte("on_date", since)
    .lte("on_date", today);

  if (completionsError) throw completionsError;

  const doneByRoutine = new Map<string, Set<string>>();
  for (const completion of completions) {
    const dates =
      doneByRoutine.get(completion.routine_id) ?? new Set<string>();
    dates.add(completion.on_date);
    doneByRoutine.set(completion.routine_id, dates);
  }

  return routines.map((routine) => {
    const done = doneByRoutine.get(routine.id) ?? new Set<string>();
    return {
      id: routine.id,
      title: routine.title,
      description: routine.description,
      weekdays: routine.weekdays,
      active: routine.active,
      dueToday: isDueOn(routine.weekdays, today),
      doneToday: done.has(today),
      streak: currentStreak(routine.weekdays, done, today),
      history: recentHistory(routine.weekdays, done, today, HISTORY_SHOWN),
    };
  });
}

export interface CreateRoutineInput {
  workspaceId: string;
  title: string;
  description?: string;
  weekdays?: number;
  createdBy: string;
}

export async function createRoutine(
  supabase: Client,
  input: CreateRoutineInput,
): Promise<string> {
  const { data, error } = await supabase
    .from("routines")
    .insert({
      workspace_id: input.workspaceId,
      title: input.title,
      description: input.description ?? null,
      weekdays: input.weekdays ?? EVERY_DAY,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export interface RoutinePatch {
  title?: string;
  description?: string | null;
  weekdays?: number;
  active?: boolean;
}

export async function updateRoutine(
  supabase: Client,
  routineId: string,
  patch: RoutinePatch,
): Promise<void> {
  const { error } = await supabase
    .from("routines")
    .update({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && {
        description: patch.description,
      }),
      ...(patch.weekdays !== undefined && { weekdays: patch.weekdays }),
      ...(patch.active !== undefined && { active: patch.active }),
    })
    .eq("id", routineId);

  if (error) throw error;
}

export async function deleteRoutine(
  supabase: Client,
  routineId: string,
): Promise<void> {
  const { error } = await supabase.from("routines").delete().eq("id", routineId);
  if (error) throw error;
}

/**
 * Records — or unrecords — one day.
 *
 * Ticking twice is not an error: a second tap that raced the first
 * lands on the same primary key and is dropped, keeping the first
 * tick's name and time on the row. Unticking a day that was never
 * ticked deletes no rows and is equally fine. Both are the state the
 * caller asked for, and the caller asked for a state rather than for
 * a change.
 *
 * `ignoreDuplicates` is what makes the first of those an insert and
 * nothing else — an upsert that overwrote would need UPDATE on a
 * table that deliberately grants only insert and delete, because a
 * completion is a fact about a day rather than a field to edit.
 */
export async function setCompletion(
  supabase: Client,
  input: { routineId: string; date: string; done: boolean; userId: string },
): Promise<void> {
  if (input.done) {
    const { error } = await supabase.from("routine_completions").upsert(
      {
        routine_id: input.routineId,
        on_date: input.date,
        completed_by: input.userId,
      },
      { onConflict: "routine_id,on_date", ignoreDuplicates: true },
    );
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("routine_completions")
    .delete()
    .eq("routine_id", input.routineId)
    .eq("on_date", input.date);

  if (error) throw error;
}
