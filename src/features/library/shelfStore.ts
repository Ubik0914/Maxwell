"use client";

import type { ShelvedBook } from "@/domain/library/filter";

/*
 * The freshest shelf this tab knows of, shared by the library and the
 * scan screen.
 *
 * They are separate routes, so the library does not see what the scan
 * screen added: going back restores the list the router cached when the
 * library was first drawn. Every add therefore asks the server for the
 * shelf again once its POST has finished, and the library starts from
 * that — and asks once more itself on arriving — rather than from the
 * stale copy.
 *
 * Module state, which on the server would be shared between requests:
 * it is only ever written in the browser (refreshShelf and rememberShelf
 * are called from effects and handlers), so the server always sees null.
 */

let shelf: ShelvedBook[] | null = null;
let latest = 0;
const listeners = new Set<(books: ShelvedBook[]) => void>();

/** What the library last knew, to start from instead of a stale page. */
export function knownShelf(): ShelvedBook[] | null {
  return shelf;
}

/** The library's own changes (edits, deletes) are the freshest too. */
export function rememberShelf(books: ShelvedBook[]) {
  shelf = books;
}

/** Called with each fresh shelf while subscribed. */
export function subscribeShelf(listener: (books: ShelvedBook[]) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * GET the whole shelf and hand it to whoever is listening. Of several
 * in flight (a quick run of scans), only the last one asked for is
 * kept, so an early answer arriving late cannot undo a later one.
 * Failing is quiet: the screen keeps what it has.
 */
export async function refreshShelf(): Promise<void> {
  const ticket = ++latest;
  try {
    const response = await fetch("/api/v1/books?limit=5000", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return;
    const body = (await response.json()) as {
      data?: { books?: ShelvedBook[] };
    };
    const books = body.data?.books;
    if (!Array.isArray(books) || ticket !== latest) return;
    shelf = books;
    listeners.forEach((listener) => listener(books));
  } catch {
    // Offline or the server hiccuped: nothing to replace.
  }
}
