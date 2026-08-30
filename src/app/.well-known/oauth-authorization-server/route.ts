import { NextResponse, type NextRequest } from "next/server";

/**
 * RFC 8414 authorization server metadata. This is the document a client
 * fetches once it has been pointed here by
 * /.well-known/oauth-protected-resource, and everything else in
 * src/app/oauth/ exists to make these URLs true.
 *
 * The issuer is the request's own origin rather than a configured
 * constant, so this answers correctly on a Vercel preview deployment or
 * localhost without an env var for every possible host.
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;

  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["maxwell"],
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
