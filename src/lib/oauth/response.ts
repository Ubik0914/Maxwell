import { NextResponse } from "next/server";

/** RFC 6749 §5.2 / §11.4.1 error codes, plus RFC 8707's invalid_target. */
export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "invalid_scope"
  | "invalid_target"
  | "access_denied"
  | "server_error";

function statusFor(error: OAuthErrorCode): number {
  if (error === "invalid_client") return 401;
  if (error === "server_error") return 500;
  return 400;
}

/** A token/registration endpoint error body — never the app's {error:{code,message}} envelope, since the caller here is a generic OAuth client, not Maxwell's own. */
export function oauthError(
  error: OAuthErrorCode,
  description?: string,
  status?: number,
) {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    {
      status: status ?? statusFor(error),
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    },
  );
}

/**
 * RFC 6749 §5.1 (token) / RFC 7591 (registration): both success bodies
 * are plain JSON, never cached.
 */
export function oauthJsonSuccess(body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

/**
 * RFC 6749 §4.1.2.1: once client_id and redirect_uri are both known to
 * be genuine, later errors (a denied consent, an unsupported scope) are
 * reported by sending the browser back to the client with `error` in
 * the query string, not by rendering an error page of our own — the
 * client is the one who knows what to do next.
 */
export function buildAuthorizeErrorRedirect(
  redirectUri: string,
  error: OAuthErrorCode,
  description?: string,
  state?: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}
