import { z } from "zod";
import { EVERY_DAY } from "@/domain/routine/schedule";
import { parseIsoDate } from "@/lib/date/calendar";

/**
 * A schedule, as the column will take it: at least one day, at most
 * all seven. 0 is rejected here rather than at the database, so the
 * message says which of the two it is.
 */
const weekdays = z
  .number()
  .int("Weekdays must be a whole number")
  .min(1, "Pick at least one day")
  .max(EVERY_DAY, "There are only seven days in a week");

/**
 * A calendar date, checked against the calendar — not merely against
 * the shape of one. "2026-02-30" is ten characters in the right
 * pattern and not a day anybody did anything on.
 */
const isoDate = z
  .string()
  .refine((value) => parseIsoDate(value) !== null, "Not a calendar date");

export const createRoutineSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be 5000 characters or fewer")
    .optional(),
  weekdays: weekdays.optional(),
});

export const updateRoutineSchema = z.object({
  routineId: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or fewer")
    .optional(),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be 5000 characters or fewer")
    .nullable()
    .optional(),
  weekdays: weekdays.optional(),
  active: z.boolean().optional(),
});

/**
 * Ticking or unticking one day's box.
 *
 * The date is a parameter rather than "now", because the only clock
 * that knows which day it is where the person is standing is theirs —
 * see useToday. A server that decided this itself would clear the
 * morning's boxes at 9am in Tokyo.
 */
export const setRoutineCompletionSchema = z.object({
  routineId: z.string().uuid(),
  date: isoDate,
  done: z.boolean(),
});

export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;
export type UpdateRoutineInput = z.infer<typeof updateRoutineSchema>;
export type SetRoutineCompletionInput = z.infer<
  typeof setRoutineCompletionSchema
>;
