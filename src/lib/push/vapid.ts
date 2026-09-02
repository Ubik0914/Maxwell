/**
 * The keys that let this deployment speak to a push service.
 *
 * A push message is posted to a URL belonging to Google, Apple or
 * Mozilla, and the only thing that stops anyone else posting to that
 * URL is a signature from the key pair the subscription was made
 * with — VAPID, RFC 8292. The public half goes to the browser at
 * subscribe time, the private half stays here and signs, and the two
 * have to be the same pair forever: replace them and every subscription
 * already made goes quiet, because the service will refuse a signature
 * from a key the subscription has never heard of.
 *
 *   npx web-push generate-vapid-keys
 *
 * prints a fresh pair to paste into the environment. `VAPID_SUBJECT` is
 * how a push service reaches whoever is sending — a mailto: or an
 * https: URL, and it is only ever read by a human at Google or Apple
 * chasing a misbehaving sender.
 *
 * Nothing here throws when the keys are missing. Notifications are one
 * feature of the app, not the app: a deployment without them should
 * work in every other respect, and say so on the settings screen rather
 * than fail at the point of use.
 */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const DEFAULT_SUBJECT = "https://github.com/Ubik0914/Maxwell";

/**
 * The public half, which is not a secret — the browser is given it to
 * make a subscription with. It is read from the server's environment
 * rather than baked into the client bundle so that turning
 * notifications on is a matter of setting two variables and restarting,
 * not rebuilding.
 */
export function publicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function vapidKeys(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;

  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT?.trim() || DEFAULT_SUBJECT,
  };
}
