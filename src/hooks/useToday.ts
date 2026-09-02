"use client";

import { useSyncExternalStore } from "react";
import { toIsoDate } from "@/lib/date/calendar";

/** Today where the browser is standing, as an ISO date. */
function localTodayIso(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Wakes the store when the tab comes back, so a page left open
 * overnight is not still offering yesterday's boxes in the morning.
 * There is no timer: nobody is watching the screen at midnight, and a
 * phone picked up at 7am fires both of these on the way.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
}

/**
 * The day the person is having — not the day the server is having.
 *
 * A due-date badge can be a few hours out and only look slightly
 * wrong; a routine's tick box cannot. In Tokyo the UTC date turns over
 * at 9am, so a UTC "today" would file the morning's ticks under
 * yesterday and then clear the boxes over breakfast.
 *
 * Read as an external store rather than in an effect so that hydration
 * gets the server's answer — the same string the server rendered, no
 * mismatch — and the render immediately after gets the browser's. The
 * two agree everywhere the two clocks agree, which is most of the
 * world most of the day.
 */
export function useToday(serverToday: string): string {
  return useSyncExternalStore(subscribe, localTodayIso, () => serverToday);
}
