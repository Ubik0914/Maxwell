import type { NextRequest } from "next/server";
import { createAnonymousClient } from "@/lib/supabase/bearer";
import { tokenRequestSchema } from "@/lib/validation/oauth";
import { sha256Hex, verifyPkceS256 } from "@/lib/oauth/crypto";
import { oauthError, oauthJsonSuccess } from "@/lib/oauth/response";

/**
 * RFC 6749 §3.2 token endpoint. Two grants, mirroring exactly what
 * POST /api/v1/auth/token already does for password/refresh — this
 * route's only new work is authorization_code, which trades a code (see
 * dag.oauth_redeem_code) for the Supabase session that code was wrapping.
 *
 * Body is application/x-www-form-urlencoded per spec, not JSON.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const parsed = tokenRequestSchema.safeParse(params);

  if (!parsed.success) {
    return oauthError(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid token request",
    );
  }

  const supabase = createAnonymousClient();

  if (parsed.data.grant_type === "refresh_token") {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: parsed.data.refresh_token,
    });

    if (error || !data.session) {
      return oauthError(
        "invalid_grant",
        "That refresh token is no longer valid.",
      );
    }

    return oauthJsonSuccess({
      access_token: data.session.access_token,
      token_type: "Bearer",
      expires_in: data.session.expires_in ?? 3600,
      refresh_token: data.session.refresh_token,
    });
  }

  const { code, redirect_uri, client_id, code_verifier, resource } =
    parsed.data;

  const { data: rows, error } = await supabase.rpc("oauth_redeem_code", {
    p_code_hash: sha256Hex(code),
  });

  if (error) {
    return oauthError("server_error", "Could not redeem authorization code.", 500);
  }

  const grant = rows?.[0];
  if (!grant) {
    return oauthError(
      "invalid_grant",
      "That authorization code is unknown, expired, or already used.",
    );
  }

  // Redeemed already (the row is gone either way) — checked after
  // redemption, not before, so a mismatched replay still burns the code
  // rather than leaving it usable for a second, correctly-formed attempt.
  if (grant.client_id !== client_id || grant.redirect_uri !== redirect_uri) {
    return oauthError(
      "invalid_grant",
      "client_id or redirect_uri does not match the original request.",
    );
  }

  if (grant.resource && resource && grant.resource !== resource) {
    return oauthError(
      "invalid_target",
      "resource does not match the original request.",
    );
  }

  if (!verifyPkceS256(code_verifier, grant.code_challenge)) {
    return oauthError("invalid_grant", "code_verifier does not match.");
  }

  return oauthJsonSuccess({
    access_token: grant.access_token,
    token_type: "Bearer",
    expires_in: grant.expires_in,
    ...(grant.refresh_token ? { refresh_token: grant.refresh_token } : {}),
    ...(grant.scope ? { scope: grant.scope } : {}),
  });
}

export async function GET() {
  return oauthError("invalid_request", "POST only.", 405);
}
