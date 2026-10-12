import { NextResponse, type NextRequest } from "next/server";
import { MailError, USER_MESSAGES, webPath, webUrl } from "@/mail/core";
import { completeOAuth, OAUTH_COOKIE, readOAuthCookie } from "@/mail/server/auth-flow";
import { getContainer } from "@/mail/server/container";

/** Google の同意画面からの戻り先。接続結果を設定画面（Android はアプリのディープリンク）へ返す */
export async function GET(req: NextRequest) {
  const c = getContainer();
  const sp = req.nextUrl.searchParams;
  const clear = (res: NextResponse) => {
    res.cookies.delete({ name: OAUTH_COOKIE, path: webPath("/api/auth/google") });
    return res;
  };
  const cookieValue = req.cookies.get(OAUTH_COOKIE)?.value;
  try {
    const r = await completeOAuth(c, { code: sp.get("code"), state: sp.get("state"), error: sp.get("error") }, cookieValue);
    if (r.platform === "android") {
      // 外部ブラウザから、ログイン済みの WebView（アプリ）へ戻す。接続はもう保存済み
      return clear(NextResponse.redirect(`${c.env.ANDROID_APP_SCHEME}://auth?result=connected`));
    }
    return clear(NextResponse.redirect(new URL(r.next, c.env.APP_ORIGIN)));
  } catch (e) {
    const message = e instanceof MailError ? (e.message !== e.code ? e.message : USER_MESSAGES[e.code]) : USER_MESSAGES.INTERNAL;
    if (!(e instanceof MailError)) c.logger.error("auth.callback_failed", { error: e });
    if ((await readOAuthCookie(c, cookieValue))?.platform === "android") {
      return clear(NextResponse.redirect(`${c.env.ANDROID_APP_SCHEME}://auth?error=${encodeURIComponent(message)}`));
    }
    const url = webUrl("/settings", c.env.APP_ORIGIN);
    url.searchParams.set("error", message);
    return clear(NextResponse.redirect(url));
  }
}

