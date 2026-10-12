import { MailError, USER_MESSAGES, webPath, webUrl } from "@synedge/mail-core";
import { NextResponse, type NextRequest } from "next/server";
import { completeOAuth, createHandoffCode, OAUTH_COOKIE } from "@/server/auth-flow";
import { getContainer } from "@/server/container";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";

export async function GET(req: NextRequest) {
  const c = getContainer();
  const sp = req.nextUrl.searchParams;
  const loginUrl = webUrl("/login", c.env.APP_ORIGIN);
  try {
    const r = await completeOAuth(
      c,
      { code: sp.get("code"), state: sp.get("state"), error: sp.get("error") },
      req.cookies.get(OAUTH_COOKIE)?.value,
    );
    let res: NextResponse;
    if (r.platform === "android") {
      // 外部ブラウザでログインした結果を、ワンタイムコードでアプリ（WebView）へ受け渡す
      const code = await createHandoffCode(c, r.userId);
      res = NextResponse.redirect(`${c.env.ANDROID_APP_SCHEME}://auth?code=${encodeURIComponent(code)}`);
    } else {
      res = NextResponse.redirect(new URL(r.next, c.env.APP_ORIGIN));
      res.cookies.set(SESSION_COOKIE, await createSessionToken(c, r.userId, r.sessionVersion), sessionCookieOptions(c));
    }
    res.cookies.delete({ name: OAUTH_COOKIE, path: webPath("/api/auth/google") });
    return res;
  } catch (e) {
    const message = e instanceof MailError ? (e.message !== e.code ? e.message : USER_MESSAGES[e.code]) : USER_MESSAGES.INTERNAL;
    if (!(e instanceof MailError)) c.logger.error("auth.callback_failed", { error: e });
    loginUrl.searchParams.set("error", message);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete({ name: OAUTH_COOKIE, path: webPath("/api/auth/google") });
    return res;
  }
}
