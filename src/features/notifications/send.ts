import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { PushMessage } from "@/features/notifications/messages";
import * as pushRepository from "@/repositories/push-subscription.repository";
import { vapidKeys } from "@/lib/push/vapid";

type Client = SupabaseClient<Database, "dag">;

/**
 * A push service saying this device is not coming back: the
 * subscription was revoked, the browser was uninstalled, the user
 * cleared their site data. Both codes mean the same thing to us, and
 * the row is deleted rather than retried forever.
 */
const GONE = [404, 410];

/**
 * Sends one message to every device a user has registered.
 *
 * To *a user*, and in practice to the user who caused the change. That
 * is the whole of what this can do and the reason it needs no
 * privileged database access: a subscription is readable by its owner
 * and nobody else, so this runs as an ordinary user-scoped client, the
 * same as every other write in the app, and the service role key stays
 * unused (spec Section 105). Telling a *teammate* their task came free
 * would mean reading a row belonging to someone else — a change to make
 * deliberately, with a function that decides who may be told what,
 * rather than by widening a policy here.
 *
 * Nothing about this is allowed to fail loudly. It runs after the
 * response has gone out, on behalf of a request whose real work has
 * already succeeded; a push service having a bad afternoon is not a
 * failed status change, and must not be reported as one.
 */
export async function sendToUser(
  supabase: Client,
  userId: string,
  message: PushMessage,
): Promise<void> {
  const keys = vapidKeys();
  if (!keys) return;

  const targets = await pushRepository.findByUserId(supabase, userId);
  if (targets.length === 0) return;

  const payload = JSON.stringify(message);
  const gone: string[] = [];

  await Promise.all(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(target, payload, {
          vapidDetails: {
            subject: keys.subject,
            publicKey: keys.publicKey,
            privateKey: keys.privateKey,
          },
          // Long enough to survive a phone that is off for a working
          // day, short enough that nobody is told about a task that
          // came free last week.
          TTL: 12 * 60 * 60,
        });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status && GONE.includes(status)) gone.push(target.endpoint);
      }
    }),
  );

  // Left until every send has been attempted, so one dead device does
  // not stop the others being told.
  if (gone.length > 0) {
    await pushRepository.removeByEndpoints(supabase, gone).catch(() => undefined);
  }
}
