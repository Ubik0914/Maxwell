import { z } from "zod";

/**
 * A redirect_uri a client can register, and later be sent back to with
 * an authorization code. https only, with an exception for loopback —
 * the one case OAuth 2.1 itself carves out, for a client running on the
 * same machine as its own browser and unable to hold a TLS certificate.
 */
export function isAllowedRedirectUri(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

/**
 * Dynamic Client Registration (RFC 7591). Only public clients exist here
 * (see the oauth_clients migration), so token_endpoint_auth_method,
 * grant_types and response_types are accepted but not trusted — the
 * route always registers `none` / `["authorization_code","refresh_token"]`
 * / `["code"]` regardless of what is asked for, per RFC 7591's allowance
 * for the server to override requested metadata.
 */
export const registerClientSchema = z.object({
  client_name: z.string().trim().min(1).max(200).optional(),
  redirect_uris: z
    .array(z.string())
    .min(1, "redirect_uris must contain at least one URI")
    .refine((uris) => uris.every(isAllowedRedirectUri), {
      message: "redirect_uris must be https, or http on localhost/127.0.0.1",
    }),
});

export type RegisterClientInput = z.infer<typeof registerClientSchema>;

/**
 * GET /oauth/authorize query params. code_challenge_method is fixed to
 * S256 — OAuth 2.1 drops "plain", and there is no confidential client
 * here to fall back to not using PKCE at all.
 */
export const authorizeRequestSchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().refine(isAllowedRedirectUri),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  state: z.string().max(2000).optional(),
  scope: z.string().max(500).optional(),
  resource: z.string().url().optional(),
});

export type AuthorizeRequest = z.infer<typeof authorizeRequestSchema>;

/**
 * POST /oauth/token, form-urlencoded per RFC 6749. Which fields are
 * required is which grant this is — mirrors authTokenSchema's union in
 * lib/validation/auth.ts for the same reason: the shape of the body
 * already says the intent, so there is nothing to gain from a
 * `grant_type` field plus a pile of now-optional others.
 */
export const tokenRequestSchema = z.union([
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    redirect_uri: z.string().min(1),
    client_id: z.string().min(1),
    code_verifier: z.string().min(43).max(128),
    resource: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
    client_id: z.string().min(1).optional(),
    resource: z.string().optional(),
  }),
]);

export type TokenRequest = z.infer<typeof tokenRequestSchema>;
