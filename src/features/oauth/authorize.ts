import { generateAuthorizationCode, sha256Hex } from "@/lib/oauth/crypto";
import type { AuthorizeRequest } from "@/lib/validation/oauth";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * client_id and redirect_uri both check out, or neither is trustworthy —
 * OAuth 2.1's exact-match rule means a client that registered
 * `https://a.example/cb` is not the same client as one asking to be sent
 * to `https://a.example/cb/`.
 */
export async function resolveOAuthClient(
  supabase: Supabase,
  oauthRequest: AuthorizeRequest,
) {
  const { data: client } = await supabase
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", oauthRequest.client_id)
    .maybeSingle();

  if (!client || !client.redirect_uris.includes(oauthRequest.redirect_uri)) {
    return null;
  }
  return client;
}

export type IssueCodeOutcome =
  | { kind: "redirect"; url: string }
  | { kind: "invalid_client" }
  | { kind: "error"; message: string };

/**
 * The handshake's one stateful step: wraps whatever Supabase session
 * `supabase` currently holds (just signed in, or already cookied) into a
 * short-lived, single-use code, and says where to send the browser next.
 * See the oauth_authorization_codes table and dag.oauth_redeem_code for
 * the other half of this trade, at the token endpoint.
 */
export async function issueAuthorizationCode(
  supabase: Supabase,
  oauthRequest: AuthorizeRequest,
): Promise<IssueCodeOutcome> {
  const client = await resolveOAuthClient(supabase, oauthRequest);
  if (!client) return { kind: "invalid_client" };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { kind: "error", message: "Not authenticated." };

  const code = generateAuthorizationCode();
  const { error } = await supabase.from("oauth_authorization_codes").insert({
    code_hash: sha256Hex(code),
    client_id: oauthRequest.client_id,
    redirect_uri: oauthRequest.redirect_uri,
    code_challenge: oauthRequest.code_challenge,
    code_challenge_method: oauthRequest.code_challenge_method,
    resource: oauthRequest.resource ?? null,
    scope: oauthRequest.scope ?? null,
    user_id: session.user.id,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
    // A minute is enough for a redirect and an immediate token exchange,
    // and short enough that an abandoned handshake is not worth cleaning
    // up on any schedule tighter than "the next redemption attempt"
    // (dag.oauth_redeem_code sweeps expired rows as it runs).
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  if (error) {
    return {
      kind: "error",
      message: "Could not complete authorization. Try again.",
    };
  }

  const url = new URL(oauthRequest.redirect_uri);
  url.searchParams.set("code", code);
  if (oauthRequest.state) url.searchParams.set("state", oauthRequest.state);
  return { kind: "redirect", url: url.toString() };
}
