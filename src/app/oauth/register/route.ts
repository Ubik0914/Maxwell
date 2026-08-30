import type { NextRequest } from "next/server";
import { createAnonymousClient } from "@/lib/supabase/bearer";
import { registerClientSchema } from "@/lib/validation/oauth";
import { generateClientId } from "@/lib/oauth/crypto";
import { oauthError, oauthJsonSuccess } from "@/lib/oauth/response";

/**
 * RFC 7591 Dynamic Client Registration. Open to anyone, same as sign-up
 * — see the oauth_clients migration for why that is fine for a
 * public-clients-only, no-secret registry.
 *
 * Every client this issues is public and PKCE-only: whatever
 * token_endpoint_auth_method / grant_types / response_types a caller
 * asks for, what comes back is what /oauth/token and /oauth/authorize
 * actually support, per RFC 7591's allowance for the server to decide.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = registerClientSchema.safeParse(body);

  if (!parsed.success) {
    return oauthError(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid client metadata",
    );
  }

  const clientId = generateClientId();
  const supabase = createAnonymousClient();

  const { error } = await supabase.from("oauth_clients").insert({
    client_id: clientId,
    client_name: parsed.data.client_name ?? null,
    redirect_uris: parsed.data.redirect_uris,
  });

  if (error) {
    return oauthError("server_error", "Could not register client.", 500);
  }

  return oauthJsonSuccess({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: parsed.data.client_name ?? null,
    redirect_uris: parsed.data.redirect_uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}
