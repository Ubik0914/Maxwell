"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
 * Whether the scan screen's loading shell (app/scan/loading.tsx) is
 * what the person has been looking at. The shell slides the sheet up;
 * the screen that replaces it must not slide up a second time.
 */
let shellShown = false;

/** Rendered inside the shell: notes that it is on screen. */
export function ScanShellMark() {
  useEffect(() => {
    shellShown = true;
  }, []);
  return null;
}

const noSubscribe = () => () => {};

/**
 * True when the shell came first. Read through useSyncExternalStore so
 * hydrating a directly loaded /scan uses the server's answer (false) and
 * does not mismatch; the flag is cleared when the screen goes, so the
 * next open is judged afresh.
 */
export function useOpenedFromShell(): boolean {
  const shown = useSyncExternalStore(
    noSubscribe,
    () => shellShown,
    () => false,
  );
  useEffect(
    () => () => {
      shellShown = false;
    },
    [],
  );
  return shown;
}
