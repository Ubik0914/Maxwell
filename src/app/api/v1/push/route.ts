import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { publicKey } from "@/lib/push/vapid";
import * as pushRepository from "@/repositories/push-subscription.repository";

export const runtime = "nodejs";

/**
 * What the browser needs before it can ask to be notified.
 *
 * The application server key, which is public by design — it is handed
 * to `pushManager.subscribe` and travels to the push service, and its
 * only job is to be the half of a pair the private key can be proved
 * against. Null when this deployment has no keys configured, which is
 * how the settings screen knows to say notifications are unavailable
 * here rather than offering a switch that cannot work.
 *
 * Served from the server's environment rather than compiled into the
 * client bundle, so turning notifications on is two variables and a
 * restart instead of a rebuild.
 *
 * `devices` is only what the person already agreed to, for their own
 * information: how many places this account is currently reachable at.
 */
export async function GET() {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  return apiSuccess({
    publicKey: publicKey(),
    devices: await pushRepository.countForUser(supabase, user.id),
  });
}
