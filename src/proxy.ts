import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // /api/health deliberately needs no Supabase/auth to answer — it's
    // the deployment smoke-check (Section 106) and must work even
    // before env vars are configured.
    //
    // sw.js and the manifest are the installed app's own furniture:
    // fetched on every load to check for an update, belonging to
    // nobody, and readable before anyone has signed in. Refreshing a
    // session to hand back a static file is a round trip for nothing.
    "/((?!_next/static|_next/image|favicon.ico|api/health|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
