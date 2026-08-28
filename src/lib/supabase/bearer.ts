import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * A Supabase client that acts as whoever holds `token`, for callers
 * that have no cookie jar — the CLI, scripts, anything talking to
 * /api/v1 over plain HTTP.
 *
 * The token is a real Supabase user access token, forwarded on every
 * PostgREST request, so RLS applies exactly as it does in the browser:
 * a programmatic caller can reach precisely the rows its user could.
 * Nothing here elevates anything, and the service role key is never
 * involved (spec Section 105).
 *
 * Sessions are neither persisted nor refreshed here. This client lives
 * for one request, and refreshing is the caller's business — see
 * POST /api/v1/auth/token.
 */
export function createBearerClient(token: string) {
  return createSupabaseClient<Database, "dag">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "dag" },
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/**
 * A Supabase client with no identity at all, for the one endpoint that
 * runs before anyone has a token: the sign-in exchange.
 */
export function createAnonymousClient() {
  return createSupabaseClient<Database, "dag">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "dag" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
