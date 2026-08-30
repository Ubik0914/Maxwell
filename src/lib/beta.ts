export const BETA_STORAGE_KEY = "maxwell.beta";

const BETA_EVENT = "maxwell:beta";

/**
 * What turning it on gets you.
 *
 * Named here rather than left implicit, because a switch labelled
 * "Beta" that says nothing is a switch nobody presses — and one that
 * somebody presses without knowing what changed is worse. The list is
 * the point of the setting; the boolean is just how it is stored.
 *
 * A feature leaves beta by being deleted from this list and losing its
 * `useBeta()` guard, which is two lines and no migration — the flag is
 * a preference, not a schema.
 */
export const BETA_FEATURES = [
  {
    key: "csv-import",
    name: "CSV import",
    hint: "Bring a spreadsheet of tasks in, dependencies and all.",
  },
];

/**
 * Kept in localStorage, like the motion preference and for the same
 * reasons: it is one person's answer on one device, it is wanted before
 * any request could return, and it costs nothing to change your mind
 * about. The cost is that it does not follow you to another machine,
 * which for "show me the unfinished things" is the right side to err
 * on — beta is switched on where somebody is willing to be surprised.
 */
export function readBeta(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(BETA_STORAGE_KEY) === "on";
}

/**
 * Notifies when it changes — from this tab (a custom event dispatched
 * on write) or another one (`storage`, which fires only in the tabs
 * that did not do the writing).
 */
export function subscribeToBeta(onChange: () => void): () => void {
  window.addEventListener(BETA_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(BETA_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setBeta(on: boolean): void {
  if (on) {
    localStorage.setItem(BETA_STORAGE_KEY, "on");
  } else {
    localStorage.removeItem(BETA_STORAGE_KEY);
  }
  window.dispatchEvent(new Event(BETA_EVENT));
}
