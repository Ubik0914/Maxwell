import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createBearerClient } from "@/lib/supabase/bearer";

const BEARER = /^Bearer\s+(.+)$/i;

/**
 * Resolves the caller of an /api/v1 request, whichever way they arrived.
 *
 * A browser sends the session cookie the app already set. Anything
 * without a cookie jar — the CLI, a script, curl — sends
 * `Authorization: Bearer <access token>` instead, and gets a client
 * bound to that token. Either way the result is an ordinary user-scoped
 * client, so every route below this keeps one code path and RLS decides
 * what is visible.
 *
 * The bearer branch is checked first: an explicit credential on the
 * request should win over whatever cookie happens to be lying around.
 */
export async function requireApiUser() {
  const authorization = (await headers()).get("authorization");
  const token = authorization?.match(BEARER)?.[1];

  if (token) {
    const supabase = createBearerClient(token);
    // Passed explicitly: this client holds no session of its own, so
    // the token has to be handed to the auth server to be verified.
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    return { supabase, user };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
