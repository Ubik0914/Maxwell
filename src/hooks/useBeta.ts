"use client";

import { useSyncExternalStore } from "react";
import { readBeta, subscribeToBeta } from "@/lib/beta";

/**
 * Whether the unfinished things are switched on.
 *
 * localStorage is an external store, so it is read through the hook
 * built for reading one rather than copied into state by an effect: the
 * server renders it off, the client corrects it on hydration, and a
 * change made in another tab arrives here too.
 *
 * Off is what the server renders, which is also the right answer for a
 * first paint — a control that appears a frame late is a smaller
 * surprise than one that appears and is then taken away.
 */
export function useBeta(): boolean {
  return useSyncExternalStore(subscribeToBeta, readBeta, () => false);
}
