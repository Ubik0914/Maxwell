import { WEEKDAYS, weekdayOf } from "@/lib/date/calendar";

/**
 * Which days a routine comes back on.
 *
 * Held as a bitmask — bit N is weekday N, 0 being Sunday, the same
 * numbering `Date.getDay()` uses and the same order the calendar draws
 * its headings in. Every read is a membership test and every write is
 * the whole set at once, which is what a mask is good at; the seven
 * booleans it replaces would only ever be set together.
 *
 * A mask of 0 is not a schedule. Nothing here produces one, and the
 * column will not store one.
 */
export const EVERY_DAY = 0b1111111;

/** Monday to Friday, and its opposite. Named because the labels are. */
export const WEEKDAY_DAYS = 0b0111110;
export const WEEKEND_DAYS = 0b1000001;

/** Sunday first, the way WEEKDAYS is written and the calendar reads. */
export const WEEK_ORDER = [0, 1, 2, 3, 4, 5, 6];

export function hasWeekday(mask: number, weekday: number): boolean {
  return (mask & (1 << weekday)) !== 0;
}

/**
 * The same schedule with one day flipped.
 *
 * Turning off the last remaining day is refused rather than allowed
 * and rejected later: a routine due on no day would never come back,
 * which is a way of deleting something without saying so.
 */
export function toggleWeekday(mask: number, weekday: number): number {
  const flipped = mask ^ (1 << weekday);
  return flipped === 0 ? mask : flipped;
}

export function weekdaysOf(mask: number): number[] {
  return WEEK_ORDER.filter((weekday) => hasWeekday(mask, weekday));
}

export function maskOf(weekdays: readonly number[]): number {
  return weekdays.reduce((mask, weekday) => mask | (1 << weekday), 0);
}

/** Whether a mask is one the database will accept. */
export function isValidMask(mask: number): boolean {
  return Number.isInteger(mask) && mask >= 1 && mask <= EVERY_DAY;
}

/**
 * Whether the routine is due on a given ISO date.
 *
 * A date that isn't one is not due, rather than throwing: this is
 * asked once per routine per row of a list, and a malformed date is a
 * caller's bug that should not take a page down with it.
 */
export function isDueOn(mask: number, iso: string): boolean {
  const weekday = weekdayOf(iso);
  return weekday === null ? false : hasWeekday(mask, weekday);
}

/**
 * The schedule in words.
 *
 * The three sets people actually name get their own name; anything
 * else is just its days, which is shorter than any phrase describing
 * them would be.
 */
export function scheduleLabel(mask: number): string {
  if (mask === EVERY_DAY) return "Every day";
  if (mask === WEEKDAY_DAYS) return "Weekdays";
  if (mask === WEEKEND_DAYS) return "Weekends";
  return weekdaysOf(mask)
    .map((weekday) => WEEKDAYS[weekday])
    .join(" ");
}
