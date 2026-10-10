import { NextResponse, type NextRequest } from "next/server";
import { consumeHandoffCode } from "@/server/auth-flow";
import { getContainer } from "@/server/container";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";

/** Androidアプリ（WebView）でワンタイムコードをセッションCookieに交換する */
export async function GET(req: NextRequest) {
  const c = getContainer();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!c.limits.auth.take(`handoff:${ip}`).ok) return new NextResponse("Too Many Requests", { status: 429 });
  const userId = await consumeHandoffCode(c, req.nextUrl.searchParams.get("code") ?? "");
  const user = userId ? await c.repos.users.findById(userId) : null;
  if (!user) {
    const url = new URL("/login", c.env.APP_ORIGIN);
    url.searchParams.set("error", "ログインの受け渡しに失敗しました。もう一度ログインしてください。");
    return NextResponse.redirect(url);
  }
  const res = NextResponse.redirect(new URL("/mail", c.env.APP_ORIGIN));
  res.cookies.set(SESSION_COOKIE, await createSessionToken(c, user.id, user.sessionVersion), sessionCookieOptions(c));
  return res;
}
