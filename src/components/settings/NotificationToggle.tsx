"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import {
  disable,
  enable,
  isIOS,
  isStandalone,
  readStatus,
  type PushState,
} from "@/features/notifications/subscribe";

/**
 * What each state has to say for itself. The line under the switch is
 * the whole explanation somebody gets, so it says what is true now and
 * what would change it — never "an error occurred".
 */
const EXPLANATION: Record<PushState, string> = {
  unsupported: "This browser can't receive notifications.",
  unavailable: "Notifications aren't configured on this deployment.",
  denied:
    "Notifications are blocked for this site. Your browser's site settings are the only place that can undo it.",
  off: "Get told when a task you were waiting on comes free, even with Maxwell closed.",
  on: "This device will be told when work comes free, and when a story is finished.",
};

/**
 * The switch for the one thing an installed Maxwell can do that a tab
 * cannot: reach you when it is not open.
 *
 * It is deliberately one switch and no options. What gets sent is not a
 * preference — it is the two moments in a graph that are worth an
 * interruption, work coming free and a story finishing — and a screen
 * of checkboxes over that would be a screen of decisions nobody has
 * enough information to make.
 *
 * The state is read from the browser rather than remembered, because
 * the browser is where it actually lives: permission can be revoked in
 * site settings, and a subscription can be dropped by the push service,
 * both without the app being involved. Anything stored here would be a
 * second opinion, free to be wrong.
 */
export function NotificationToggle() {
  const { showError } = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  // iOS gives a subscription to a home screen app and to nothing else,
  // so on a tab there the switch would be a switch that cannot work.
  const [needsInstall, setNeedsInstall] = useState(false);

  useEffect(() => {
    let live = true;
    readStatus()
      .then(({ state }) => {
        if (!live) return;
        setState(state);
        setNeedsInstall(isIOS() && !isStandalone());
      })
      .catch(() => {
        if (live) setState("unsupported");
      });
    return () => {
      live = false;
    };
  }, []);

  async function toggle() {
    if (state === null || busy) return;
    setBusy(true);
    try {
      if (state === "on") {
        await disable();
        setState("off");
      } else {
        setState(await enable());
      }
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Could not change notifications.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state === null) {
    return <p className="text-sm text-text-faint">Checking…</p>;
  }

  const canToggle = state === "on" || state === "off";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-text-muted">Push notifications</span>
        {canToggle ? (
          <button
            type="button"
            role="switch"
            aria-checked={state === "on"}
            aria-label="Push notifications"
            disabled={busy}
            onClick={toggle}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
              state === "on"
                ? "border-accent bg-accent-soft"
                : "border-border bg-bg"
            }`}
          >
            <span
              className={`absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition-[left,background-color] ${
                state === "on" ? "left-6 bg-accent" : "left-1 bg-text-faint"
              }`}
            />
          </button>
        ) : (
          <span className="text-xs uppercase tracking-wide text-text-faint">
            {state === "denied" ? "Blocked" : "Unavailable"}
          </span>
        )}
      </div>

      <p className="text-xs text-text-faint">{EXPLANATION[state]}</p>

      {needsInstall && state !== "on" && (
        <p className="text-xs text-text-faint">
          On iPhone and iPad, add Maxwell to your home screen first — Safari
          only allows notifications for an installed app. Share → Add to Home
          Screen.
        </p>
      )}
    </div>
  );
}
