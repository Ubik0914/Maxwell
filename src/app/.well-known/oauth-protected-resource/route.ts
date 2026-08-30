import { NextResponse, type NextRequest } from "next/server";

/**
 * RFC 9728 protected resource metadata. /api/mcp's 401 response points
 * here (WWW-Authenticate: ... resource_metadata="…"), and this in turn
 * points at the authorization server metadata — the two hops an MCP
 * client follows before it ever shows the user a login screen.
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;

  return NextResponse.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
