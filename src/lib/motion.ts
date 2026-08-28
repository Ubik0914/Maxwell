export type MotionPreference = "system" | "full" | "reduced";

export const MOTION_STORAGE_KEY = "maxwell.motion";
export const MOTION_OPTIONS: MotionPreference[] = ["system", "full", "reduced"];

/**
 * Resolves a stored preference into the value the stylesheet keys on.
 *
 * Kept as a string of source rather than an imported function because
 * its first caller is an inline <script> in the document head: the
 * attribute has to be on <html> before the first paint, or a page opens
 * with the wrong amount of motion for a frame and then corrects itself,
 * which is precisely the sort of jolt the setting exists to avoid.
 */
export const MOTION_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(MOTION_STORAGE_KEY)});
    var reduced =
      stored === "reduced" ||
      (stored !== "full" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches);
    document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  } catch (e) {
    document.documentElement.dataset.motion = "full";
  }
})();
`.trim();

const MOTION_EVENT = "maxwell:motion";

export function readMotionPreference(): MotionPreference {
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem(MOTION_STORAGE_KEY);
  return stored === "full" || stored === "reduced" ? stored : "system";
}

/**
 * Notifies when the preference changes — from this tab (a custom event
 * dispatched on write) or another one (`storage`, which only fires in
 * the tabs that didn't do the writing). Together they let the setting
 * follow you across a couple of open windows.
 */
export function subscribeToMotionPreference(onChange: () => void): () => void {
  window.addEventListener(MOTION_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MOTION_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Writes the preference and applies it immediately, so the canvas
 * responds while the menu is still open rather than on the next load.
 */
export function applyMotionPreference(preference: MotionPreference): void {
  if (preference === "system") {
    localStorage.removeItem(MOTION_STORAGE_KEY);
  } else {
    localStorage.setItem(MOTION_STORAGE_KEY, preference);
  }

  const reduced =
    preference === "reduced" ||
    (preference === "system" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches);

  document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  window.dispatchEvent(new Event(MOTION_EVENT));
}
