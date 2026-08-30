import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";

/**
 * Who the caller is.
 *
 * The token exchange says so once, at sign-in, and after that a client
 * holding a token had no way to ask — which is fine for a CLI that
 * wrote the answer down, and not fine for anything that was handed a
 * token by somebody else. The MCP server is the second kind: over HTTP
 * it has no credentials file to read a name out of.
 *
 * A round trip on purpose. "Who am I" is really "does this token still
 * work, and for whom", and only the auth server can answer that.
 */
export async function GET() {
  const { user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  return apiSuccess({ id: user.id, email: user.email ?? null });
}
