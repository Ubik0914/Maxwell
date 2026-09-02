import { z } from "zod";

/**
 * What a browser hands over when it makes a push subscription — the
 * shape of `PushSubscription.toJSON()`, which is what the client sends
 * verbatim rather than picking apart first.
 *
 * The endpoint is a URL at a push service and is checked as one: it is
 * about to be stored and later posted to, and a value that is not a URL
 * could only ever have been a mistake or an attempt at something. The
 * keys are opaque base64url and are only length-bounded — their
 * correctness is not ours to judge, and the push service will say so
 * soon enough if they are wrong.
 */
export const saveSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({
      p256dh: z.string().min(1).max(200),
      auth: z.string().min(1).max(200),
    }),
  }),
});

export const removeSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
});

export type SaveSubscriptionInput = z.infer<typeof saveSubscriptionSchema>;
