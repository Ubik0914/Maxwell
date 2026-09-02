import { shiftDate } from "@/lib/date/calendar";
import { isDueOn } from "@/domain/routine/schedule";

/**
 * How far back a routine's record is read.
 *
 * A streak has to stop somewhere — the alternative is a walk with no
 * end for a routine nobody has ever missed — and the same number
 * bounds the query that fetches the log, so the answer on screen is
 * never longer than the evidence behind it. Half a year is more streak
 * than anyone needs to see and one small query to fetch.
 */
export const HISTORY_WINDOW_DAYS = 180;

/**
 * The dates the routine was due on, most recent first, starting at
 * `today` if it is one of them.
 */
export function dueDatesBackFrom(
  mask: number,
  today: string,
  count: number,
): string[] {
  const dates: string[] = [];
  let cursor: string | null = today;

  for (let step = 0; step < HISTORY_WINDOW_DAYS && dates.length < count; step += 1) {
    if (cursor === null) break;
    if (isDueOn(mask, cursor)) dates.push(cursor);
    cursor = shiftDate(cursor, -1);
  }

  return dates;
}

/**
 * How many due days in a row it has been done, counting back.
 *
 * Today is the exception: a routine due today and not yet done has not
 * been missed, it has not come round yet — so an untouched morning
 * leaves yesterday's streak standing rather than resetting it to zero
 * every midnight. Doing it today extends the same count by one.
 *
 * Days it was never due on are not days it was missed, so they are
 * stepped over rather than counted or broken on.
 */
export function currentStreak(
  mask: number,
  completed: ReadonlySet<string>,
  today: string,
): number {
  const dates = dueDatesBackFrom(mask, today, HISTORY_WINDOW_DAYS);
  let streak = 0;

  for (const [index, date] of dates.entries()) {
    if (completed.has(date)) {
      streak += 1;
      continue;
    }
    // The first date is today when today is a due day; nothing else
    // gets to be pending.
    if (index === 0 && date === today) continue;
    break;
  }

  return streak;
}

export interface HistoryDay {
  date: string;
  done: boolean;
}

/**
 * The last `count` due days, oldest first — the row of marks a person
 * reads left to right to see how it has been going.
 */
export function recentHistory(
  mask: number,
  completed: ReadonlySet<string>,
  today: string,
  count: number,
): HistoryDay[] {
  return dueDatesBackFrom(mask, today, count)
    .reverse()
    .map((date) => ({ date, done: completed.has(date) }));
}
