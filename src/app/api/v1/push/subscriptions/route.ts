import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import {
  removeSubscriptionSchema,
  saveSubscriptionSchema,
} from "@/lib/validation/push";
import * as pushRepository from "@/repositories/push-subscription.repository";

export const runtime = "nodejs";

/**
 * Registers a device, so a push can find it later.
 *
 * The row is the user's own and nobody else's — RLS says so, and the
 * sender reads it back the same way — which is what keeps this feature
 * out of the business of privileged database access. What is stored is
 * what encryption needs and nothing more: where to post, and the two
 * keys the message is sealed with.
 *
 * Nothing here decides *what* someone is told; that is the Status
 * Engine's business. Turning the switch on is only the address.
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const body = await request.json().catch(() => null);
  const parsed = saveSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid subscription",
    );
  }

  const { endpoint, keys } = parsed.data.subscription;

  try {
    await pushRepository.save(supabase, user.id, {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      // Only so somebody can tell one of their devices from another.
      // Truncated to what the column takes rather than refused: a
      // header nobody chose is not worth failing a request over.
      userAgent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
    });
  } catch (error) {
    if (error instanceof pushRepository.EndpointTakenError) {
      // The same browser, still holding a subscription it made while
      // signed in as somebody else. The client's move is to throw that
      // subscription away and make a fresh one, which is a different
      // endpoint and no longer anybody's.
      return apiError(
        ErrorCode.PUSH_ENDPOINT_TAKEN,
        "This browser is already subscribed under another account. Subscribe again to replace it.",
      );
    }
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to save subscription.");
  }

  return apiSuccess({ endpoint }, 201);
}

/**
 * Forgets a device.
 *
 * By endpoint, because that is the only name a browser has for its own
 * subscription, and RLS keeps the deletion to rows this account owns —
 * so knowing somebody else's endpoint still does not let you switch
 * their phone off.
 */
export async function DELETE(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const body = await request.json().catch(() => null);
  const parsed = removeSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid endpoint",
    );
  }

  try {
    await pushRepository.removeByEndpoints(supabase, [parsed.data.endpoint]);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to remove subscription.");
  }

  return apiSuccess({ endpoint: parsed.data.endpoint });
}
