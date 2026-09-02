/**
 * The browser half of turning notifications on.
 *
 * Three parties have to agree before a phone can be told anything: the
 * person (permission), the browser's push service (a subscription), and
 * this deployment (the row that says where to post). This is the order
 * they are asked in, and the only place that order lives.
 */

export type PushState =
  /** No service worker or no Push API — an old browser, or a private window. */
  | "unsupported"
  /** The app has no VAPID keys, so there is nothing to subscribe to. */
  | "unavailable"
  /** The person said no, and only their browser settings can undo it. */
  | "denied"
  | "off"
  | "on";

export interface PushStatus {
  state: PushState;
  /** How many devices this account is currently reachable at. */
  devices: number;
}

export function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Whether this is a home screen app rather than a tab.
 *
 * Worth knowing on iOS and nowhere else: Safari grants a push
 * subscription only to an installed app, so a switch offered in a tab
 * there would be a switch that cannot be flipped.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS' own, from before the standard one.
    ("standalone" in navigator && navigator.standalone === true)
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac, and is only told apart by the
    // touch screen no Mac has.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * The application server key, as `pushManager.subscribe` wants it:
 * base64url in, raw bytes out.
 */
function decodeKey(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));

  // Written into an ArrayBuffer of its own rather than built with
  // Uint8Array.from: subscribe() takes a view over a plain ArrayBuffer,
  // and the shorthand's type allows a shared one it will not accept.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

interface PushConfig {
  publicKey: string | null;
  devices: number;
}

async function config(): Promise<PushConfig> {
  const response = await fetch("/api/v1/push", { cache: "no-store" });
  if (!response.ok) return { publicKey: null, devices: 0 };
  const payload = await response.json();
  return {
    publicKey: payload?.data?.publicKey ?? null,
    devices: payload?.data?.devices ?? 0,
  };
}

/** Where this device stands, without changing anything. */
export async function readStatus(): Promise<PushStatus> {
  if (!isSupported()) return { state: "unsupported", devices: 0 };

  const { publicKey, devices } = await config();
  if (!publicKey) return { state: "unavailable", devices };

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) return { state: "on", devices };

  return {
    state: Notification.permission === "denied" ? "denied" : "off",
    devices,
  };
}

async function register(subscription: PushSubscription): Promise<Response> {
  return fetch("/api/v1/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
}

/**
 * Asks for permission, subscribes, and tells the server where to post.
 *
 * The retry is not paranoia. A push subscription belongs to the browser
 * and outlives a session, so a browser where somebody else signed in
 * before still holds theirs: the server refuses that endpoint because
 * it is on file under another account, and the way out is to throw the
 * subscription away and make a new one, which has a new endpoint that
 * is nobody's. The same move fixes the other stale case — a
 * subscription made against an application server key this deployment
 * has since replaced, which the browser reports as an InvalidStateError.
 */
export async function enable(): Promise<PushState> {
  if (!isSupported()) return "unsupported";

  const { publicKey } = await config();
  if (!publicKey) return "unavailable";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = decodeKey(publicKey);

  const subscribe = async () => {
    try {
      return await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch {
      // Held under a different key. Drop it and ask again.
      const stale = await registration.pushManager.getSubscription();
      await stale?.unsubscribe();
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }
  };

  let subscription = await subscribe();
  let response = await register(subscription);

  if (response.status === 409) {
    await subscription.unsubscribe();
    subscription = await subscribe();
    response = await register(subscription);
  }

  if (!response.ok) {
    // Never leave the browser subscribed to something the server does
    // not know about: that is a device that believes it is on and will
    // never be told anything.
    await subscription.unsubscribe();
    throw new Error("Could not register this device for notifications.");
  }

  return "on";
}

/** Both ends, in the order that leaves nothing behind either way. */
export async function disable(): Promise<void> {
  if (!isSupported()) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await fetch("/api/v1/push/subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);

  await subscription.unsubscribe();
}
