/**
 * Maxwell's service worker.
 *
 * It exists for one reason above the others: a web push subscription
 * belongs to a service worker, and a push that arrives while the tab is
 * closed is delivered here or nowhere. Everything else it does is the
 * small change that comes back from having one.
 *
 * Written by hand rather than generated. A precache manifest of every
 * build asset is the usual thing and would be wrong here: the app is
 * server-rendered, its pages are per-user and change the moment anyone
 * moves a task, and a stale shell served to somebody who is online is a
 * worse failure than a page that takes a moment. So nothing is cached
 * except the one page that says the network is gone, and every request
 * goes to the network first.
 *
 * Bumping VERSION is how a new worker takes over: the name of the cache
 * changes, activate deletes the old one, and skipWaiting means the
 * change lands on this page load rather than the one after the next
 * time every tab is closed.
 */

const VERSION = "maxwell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      // An install that fails because the offline page could not be
      // fetched would leave the app with no worker at all, and with it
      // no notifications. The fallback is the least important thing
      // here; it is allowed to be missing.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== VERSION).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Navigations only, and the network always comes first.
 *
 * A page is answered from the cache in exactly one case: the network
 * did not answer at all. Everything else — API calls, the graph's data,
 * static assets, anything not a navigation — is left alone, because the
 * browser's own cache already handles those correctly and a second
 * layer here could only get them wrong.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return (
        cached ??
        new Response("Offline", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    }),
  );
});

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_NOTIFICATION = {
  title: "Maxwell",
  body: "Something moved in your graph.",
  url: "/stories",
  tag: "maxwell",
};

function payloadOf(event) {
  if (!event.data) return DEFAULT_NOTIFICATION;
  try {
    return { ...DEFAULT_NOTIFICATION, ...event.data.json() };
  } catch {
    return { ...DEFAULT_NOTIFICATION, body: event.data.text() };
  }
}

self.addEventListener("push", (event) => {
  const payload = payloadOf(event);

  event.waitUntil(
    (async () => {
      // Somebody with the app open in front of them has already been
      // told: the board they are looking at moves by itself. A system
      // notification for a change they just watched happen is noise,
      // and the one case that matters most — you pressed Done, so the
      // task after it is Ready — would fire on every press. The page
      // gets a quiet toast instead. (A visible client is the one case
      // where the Push API lets a message go by without a notification;
      // with none, the browser would post a generic one of its own.)
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const watching = clients.find((client) => client.visibilityState === "visible");
      if (watching) {
        for (const client of clients) client.postMessage({ maxwell: payload });
        return;
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        // The tag collapses a run of these into one: an agent marking
        // five tasks done in a row should leave one notification about
        // the story, not five to swipe away.
        tag: payload.tag,
        renotify: true,
        data: { url: payload.url },
      });
    })(),
  );
});

/**
 * Opening the thing the notification was about, in the window that is
 * already open where there is one. Two copies of the app side by side
 * is not what somebody tapping a notification asked for.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/stories";

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) await client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }

      return self.clients.openWindow(url);
    })(),
  );
});

/**
 * A subscription the browser replaced on its own.
 *
 * It happens — a key rotation at the push service, a browser deciding a
 * subscription has gone stale — and the app finds out only here. The
 * new one is registered with the same application server key as the old
 * one and sent to the server, which is what stops a device going quiet
 * without anyone touching a setting.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key = event.oldSubscription?.options?.applicationServerKey;
      if (!key) return;

      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });

      await fetch("/api/v1/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          replaces: event.oldSubscription?.endpoint ?? null,
        }),
      }).catch(() => undefined);
    })(),
  );
});
