/**
 * Calendar arithmetic on ISO date strings.
 *
 * Strings rather than Date objects throughout, because that is what a
 * task's due date is in the database and what the API speaks. Turning
 * one into a Date and back is where timezones get in: `new Date("2026-
 * 08-28")` is midnight UTC, which in Tokyo is the 28th at 09:00 and in
 * Los Angeles is the 27th at 17:00 — so a round trip through the local
 * timezone can hand back a different day than it was given.
 *
 * Everything here is pure and has no React in it, so it can be tested
 * without a browser.
 */

export const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface YearMonth {
  year: number;
  /** 1-12, the way a person says it rather than the way Date does. */
  month: number;
}

/** "2026-08-28" -> { year: 2026, month: 8 }, or null if it isn't one. */
export function parseIsoDate(
  iso: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth({ year, month })) return null;
  return { year, month, day };
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth({ year, month }: YearMonth): number {
  // Day 0 of the next month is the last day of this one, and it is the
  // one bit of Date arithmetic that is safe: the numbers never leave
  // the calendar they went in as.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 (Sunday) to 6 (Saturday), for the first of the month. */
export function firstWeekday({ year, month }: YearMonth): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

export function shiftMonth({ year, month }: YearMonth, by: number): YearMonth {
  const zeroBased = month - 1 + by;
  return {
    year: year + Math.floor(zeroBased / 12),
    month: ((zeroBased % 12) + 12) % 12 + 1,
  };
}

/**
 * The grid a month is drawn on: whole weeks, Sunday first, with the
 * days either side of the month present as nulls rather than missing.
 * Keeping the blanks means the calendar is always the same shape and
 * the columns line up under their weekday headings.
 */
export function monthGrid(at: YearMonth): (number | null)[] {
  const lead = firstWeekday(at);
  const days = daysInMonth(at);
  const cells: (number | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= days; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** "August 2026" — the calendar's own heading. */
export function monthLabel({ year, month }: YearMonth): string {
  return `${MONTHS[month - 1]} ${year}`;
}

/**
 * The weekday an ISO date falls on, 0 (Sunday) to 6 (Saturday), or
 * null if it isn't a date.
 *
 * Built out of the parsed numbers rather than by parsing the string
 * with Date, so it answers about the day that was written down rather
 * than about whichever day that string happens to be in the reader's
 * timezone.
 */
export function weekdayOf(iso: string): number | null {
  const parts = parseIsoDate(iso);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/**
 * The date `by` days away, as an ISO date. Negative goes backwards.
 *
 * UTC throughout, which is what makes it total: a local-timezone day
 * can be 23 or 25 hours long across a DST boundary, and adding "one
 * day" through one of those can land on the same date twice or skip
 * one entirely. A UTC day is always 24 hours, and the calendar this
 * walks is the calendar the dates were written in.
 */
export function shiftDate(iso: string, by: number): string | null {
  const parts = parseIsoDate(iso);
  if (!parts) return null;
  const at = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + by));
  return toIsoDate(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
}
