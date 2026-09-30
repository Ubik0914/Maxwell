"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Lets the phone's own back gesture close what is open.
 *
 * On a phone the library's detail, edit form and action list are full
 * pages, and a full page is something people leave with "back" — the
 * Android back button, the iOS edge swipe, the browser's arrow. Without
 * this, back would leave the library altogether with the page still
 * open on top of it.
 *
 * So opening one pushes a history entry for it (same URL, nothing for
 * the router to do), and going back pops that entry and closes it. Only
 * the top one closes: open the detail, then edit, and back returns to
 * the detail, then back again to the list. Closing with the ✕ instead
 * takes its own entry back off, so the next back still goes where it
 * should rather than stepping through a ghost of the closed page.
 *
 * The state pushed carries only a depth. Next's patched pushState copies
 * its own router state into the entry alongside it, so going back onto
 * it is an ordinary same-page traverse, not a reload.
 */

type Layer = { depth: number; close: () => void };

const KEY = "libOverlay";

// One stack for the whole page, so layers opened by different components
// still close in the order they were opened.
const layers: Layer[] = [];
let listening = false;
// The history depth the page was at before the first layer opened.
let base = 0;
// history.go() is asynchronous: until its popstate arrives,
// history.state still reports where we were. This is where we have
// already asked to be, so two closes in the same tick (or React's
// development double-mount) do not each step back from the same stale
// position and overshoot off the page.
let pending: number | null = null;
// Work waiting for that step back to land — a navigation, say, which
// would otherwise race the back and be undone by it.
let afterLanding: (() => void)[] = [];

function depthOf(state: unknown): number {
  const value = (state as Record<string, unknown> | null)?.[KEY];
  return typeof value === "number" ? value : 0;
}

function currentDepth(): number {
  return pending ?? depthOf(history.state);
}

function onPopState(event: PopStateEvent) {
  pending = null;
  const depth = depthOf(event.state);
  // Everything above the entry we landed on has been backed out of.
  while (layers.length > 0 && layers[layers.length - 1].depth > depth) {
    layers.pop()!.close();
  }
  const queued = afterLanding;
  afterLanding = [];
  queued.forEach((run) => run());
}

/**
 * Removes a layer and steps history back over whatever is no longer
 * open. `then` runs once that has happened — immediately if there was
 * nothing to step over.
 */
function remove(layer: Layer, then?: () => void) {
  const index = layers.indexOf(layer);
  if (index !== -1) layers.splice(index, 1);
  const keep = layers[layers.length - 1]?.depth ?? base;
  const current = currentDepth();
  if (current > keep) {
    pending = keep;
    if (then) afterLanding.push(then);
    history.go(keep - current);
  } else {
    then?.();
  }
}

/**
 * Registers an open layer. Returns `dismiss(then)`, for a layer that is
 * closing *in order to* do something else — an action that navigates
 * must wait until the back step has landed, or the two would race.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  const layerRef = useRef<Layer | null>(null);
  const releaseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    if (!listening) {
      window.addEventListener("popstate", onPopState);
      listening = true;
    }

    // Unmounted and mounted again in the same breath — React does this
    // to every effect in development, and a parent re-keying can do it
    // for real. The layer and its history entry are still there; take
    // them back instead of stepping back and pushing again, which would
    // race and close the page the moment it opened.
    if (releaseRef.current !== null) {
      clearTimeout(releaseRef.current);
      releaseRef.current = null;
    } else {
      if (layers.length === 0) base = currentDepth();
      const layer: Layer = {
        depth: (layers[layers.length - 1]?.depth ?? base) + 1,
        close: () => closeRef.current(),
      };
      layers.push(layer);
      layerRef.current = layer;
      history.pushState({ [KEY]: layer.depth }, "");
    }

    return () => {
      const layer = layerRef.current;
      // Already gone: back closed it (its entry is gone too), or it was
      // dismissed.
      if (!layer || !layers.includes(layer)) {
        layerRef.current = null;
        return;
      }
      // Closed some other way (✕, Escape, saving, deleting) — unless it
      // comes straight back (above), in the next task. Two layers
      // closing together (a delete shuts the form and the detail beneath
      // it) each get here, and `pending` makes the second step back from
      // where the first is going, not from where we were.
      releaseRef.current = setTimeout(() => {
        releaseRef.current = null;
        layerRef.current = null;
        remove(layer);
      }, 0);
    };
  }, [open]);

  return useCallback((then: () => void) => {
    const layer = layerRef.current;
    if (!layer || !layers.includes(layer)) return then();
    remove(layer, then);
  }, []);
}
