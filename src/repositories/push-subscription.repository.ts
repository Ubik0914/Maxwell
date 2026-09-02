import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database, "dag">;

/** A device to post to, in the shape RFC 8291 encryption wants it. */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface SaveSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

/**
 * Postgres' unique violation. It means this endpoint is already on file
 * for somebody else — the same browser, signed into a different
 * account, still holding the subscription the first account made. The
 * caller is told so it can go and get a fresh subscription rather than
 * treat it as a broken server.
 */
export const ENDPOINT_TAKEN = "23505";

export class EndpointTakenError extends Error {}

/**
 * Records a device, or updates the one already recorded.
 *
 * Conflicts are resolved on the endpoint because the endpoint is the
 * device: a browser asked twice for a subscription hands back the one
 * it already has, and inserting that a second time would mean sending
 * every notification twice.
 */
export async function save(
  supabase: Client,
  userId: string,
  input: SaveSubscriptionInput,
): Promise<void> {
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent,
    },
    { onConflict: "endpoint" },
  );

  if (!error) return;

  // The row exists and belongs to someone else, so RLS hid it from the
  // update half of the upsert and the insert half hit the constraint.
  if (error.code === ENDPOINT_TAKEN || error.code === "42501") {
    throw new EndpointTakenError(error.message);
  }
  throw error;
}

/** Every device this user asked to be told on. */
export async function findByUserId(
  supabase: Client,
  userId: string,
): Promise<PushTarget[]> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }));
}

export async function countForUser(
  supabase: Client,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Forgets a device. RLS decides whose row this can be, so an endpoint
 * belonging to somebody else is not an error here — it is simply not
 * there to delete.
 */
export async function removeByEndpoints(
  supabase: Client,
  endpoints: string[],
): Promise<void> {
  if (endpoints.length === 0) return;

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .in("endpoint", endpoints);

  if (error) throw error;
}
