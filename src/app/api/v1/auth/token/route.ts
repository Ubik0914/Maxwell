import type { NextRequest } from "next/server";
import { createAnonymousClient } from "@/lib/supabase/bearer";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { authTokenSchema, isRefreshGrant } from "@/lib/validation/auth";

/**
 * The way in for callers with no browser: exchange a password for an
 * access token, or a refresh token for a fresh one.
 *
 * Everything else under /api/v1 accepts the resulting token as
 * `Authorization: Bearer …` (see requireApiUser), so this is the only
 * endpoint a client needs to know about before it can do anything —
 * which is what lets the CLI be configured with nothing but a base URL.
 *
 * Access tokens are short-lived by Supabase's own policy; the refresh
 * grant is here so a long-running client can carry on without asking
 * for the password again. Sign-in attempt limits are Supabase's, the
 * same ones the browser login page is already subject to.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = authTokenSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid credentials payload",
    );
  }

  const supabase = createAnonymousClient();

  const { data, error } = isRefreshGrant(parsed.data)
    ? await supabase.auth.refreshSession({
        refresh_token: parsed.data.refreshToken,
      })
    : await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

  // An unreachable or failing auth service is not a wrong password, and
  // saying so sends people off to reset credentials that were fine all
  // along. Supabase answers a genuine rejection with 400/401 and
  // signals everything else — network trouble, an outage — with another
  // status or none at all.
  if (error && ![400, 401, 403, 422].includes(error.status ?? 0)) {
    return apiError(
      ErrorCode.INTERNAL_ERROR,
      "The authentication service is unavailable. Try again shortly.",
      503,
    );
  }

  // Deliberately not echoing Supabase's message back: it distinguishes
  // "no such user" from "wrong password", which is not something an
  // unauthenticated caller should be able to probe for.
  if (error || !data.session || !data.user) {
    return apiError(
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      isRefreshGrant(parsed.data)
        ? "That refresh token is no longer valid. Sign in again."
        : "Incorrect email or password.",
      401,
    );
  }

  return apiSuccess({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
    user: { id: data.user.id, email: data.user.email ?? null },
  });
}
