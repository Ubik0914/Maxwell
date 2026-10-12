import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // /Book is what gets typed for the library at /book. Routes are
  // case-sensitive, and next.config redirects are not, so the one
  // spelling is caught here.
  const { pathname } = request.nextUrl;
  if (pathname === "/Book" || pathname.startsWith("/Book/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/book" + pathname.slice("/Book".length);
    return NextResponse.redirect(url, 308);
  }

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
    //
    // The mail's push and cron endpoints are called by Google and by
    // Vercel Cron, never by a signed-in browser, and verify their own
    // tokens; refreshing a session there is a round trip for nobody.
    "/((?!_next/static|_next/image|favicon.ico|api/health|sw.js|manifest.webmanifest|mail/api/pubsub/|mail/api/jobs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
