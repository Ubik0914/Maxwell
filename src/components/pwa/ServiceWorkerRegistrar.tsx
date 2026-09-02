"use client";

import { useEffect } from "react";
import { useToast } from "@/components/Toast";

/**
 * Puts the service worker in place, and listens for what it has to say.
 *
 * Registration is deliberately dull: one call, after the page has
 * settled, and nothing on screen either way. A worker that fails to
 * register — an old browser, a private window, a host serving over
 * plain HTTP — costs the app its notifications and nothing else, so
 * there is no error worth interrupting anyone with.
 *
 * The message half is the other end of the rule in sw.js: a push that
 * arrives while somebody is looking at the app is not raised as a
 * system notification, because a notification for a change you are
 * watching happen is noise. It arrives here instead, as a toast in the
 * page you are already in.
 */
export function ServiceWorkerRegistrar() {
  const { showSuccess } = useToast();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    const onMessage = (event: MessageEvent) => {
      const payload = event.data?.maxwell;
      if (payload?.body) showSuccess(payload.body);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [showSuccess]);

  return null;
}
