import { NextResponse, type NextRequest } from "next/server";
import { handle, type CallApi } from "@mcp/maxwell-mcp.mjs";

/**
 * Maxwell as a remote MCP server.
 *
 * The same twelve tools the stdio server offers (mcp/maxwell-mcp.mjs),
 * over Streamable HTTP instead of a pipe, so a client that cannot run a
 * process on the user's machine can still reach them — no clone, no
 * Node, no `maxwell login`, just a URL and a token:
 *
 *   claude mcp add --transport http maxwell https://…/api/mcp \
 *     --header "Authorization: Bearer $TOKEN"
 *
 * Stateless on purpose. Every tool call is an independent request
 * carrying its own token, so there is nothing to keep between them: no
 * session id is issued, and none is expected back. That also means this
 * route holds no credentials of its own — it forwards the caller's, and
 * a request without one gets 401 rather than acting as somebody.
 *
 * Server-initiated messages are not supported (no sampling, no
 * elicitation, no notifications from here), which is why GET and DELETE
 * answer 405: the spec's way of saying this server has no stream and no
 * session to end.
 */
export const runtime = "nodejs";

/**
 * How a tool reaches the API from in here: over HTTP to this same
 * deployment, carrying the caller's own Authorization header.
 *
 * A request to ourselves rather than a call into the repositories. It
 * costs a hop, and it buys the property the whole design rests on —
 * that MCP is a client of /api/v1 and has no way into the graph that
 * /api/v1 does not have. A shortcut past the route layer here would be
 * exactly the second code path this is meant not to have, and the one
 * nobody would think to check when a rule changed.
 */
function callerFor(request: NextRequest): CallApi {
  const authorization = request.headers.get("authorization") ?? "";
  const { origin } = request.nextUrl;

  return async (path, { method = "GET", body } = {}) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        Authorization: authorization,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.error?.message ??
          `Request failed (${response.status} ${response.statusText})`,
      );
    }
    return payload?.data;
  };
}

export async function POST(request: NextRequest) {
  // Every method here is protected, tools/list included: what tools
  // exist is a fact about a Maxwell, not a public directory. 401 with a
  // challenge is what tells a client to go and get a token rather than
  // that the server is broken. resource_metadata (RFC 9728) is what
  // turns that challenge into a client that can actually get one on its
  // own — it is the first hop of the discovery chain a claude.ai/Claude
  // Desktop connector follows down to /oauth/authorize.
  if (!request.headers.get("authorization")) {
    const resourceMetadataUrl = `${request.nextUrl.origin}/.well-known/oauth-protected-resource`;
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Bearer token required." } },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
        },
      },
    );
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  const call = callerFor(request);

  // A batch is only legal in the older protocol versions, and is
  // accepted rather than refused because refusing costs more than the
  // four lines that handle it.
  const answers = Array.isArray(body)
    ? (await Promise.all(body.map((message) => handle(message, call)))).filter(
        (answer) => answer !== null,
      )
    : await handle(body, call);

  // Notifications take no reply. 202 with an empty body is how the
  // transport says "received, nothing to say".
  if (answers === null || (Array.isArray(answers) && answers.length === 0)) {
    return new NextResponse(null, { status: 202 });
  }

  return NextResponse.json(answers);
}

/** No server-initiated stream to open. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

/** No session was issued, so there is none to end. */
export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
