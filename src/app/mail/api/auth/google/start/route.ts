import { NextResponse, type NextRequest } from "next/server";
import { webUrl } from "@/mail/core";
import { readConnectTicket, startOAuth } from "@/mail/server/auth-flow";
import { getContainer } from "@/mail/server/container";
import { getSession } from "@/mail/server/session";

/**
 * Gmail の接続（Google の同意画面）を始める。
 * - ブラウザ：Maxwell のログイン Cookie で利用者を決める。未ログインなら Maxwell のログインへ。
 * - Android：外部ブラウザで開かれ、Cookie がないので、WebView で発行した接続チケットで利用者を決める。
 */
export async function GET(req: NextRequest) {
  const c = getContainer();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!c.limits.auth.take(`start:${ip}`).ok) return new NextResponse("Too Many Requests", { status: 429 });
  const sp = req.nextUrl.searchParams;

  let userId: string;
  let platform: "web" | "android";
  let next: string;
  const ticket = await readConnectTicket(c, sp.get("ticket"));
  if (ticket) {
    userId = ticket.userId;
    platform = "android";
    next = ticket.next;
  } else {
    const session = await getSession(c, req);
    if (!session) {
      const login = new URL("/login", c.env.APP_ORIGIN);
      login.searchParams.set("next", webUrl("/settings", c.env.APP_ORIGIN).pathname);
      return NextResponse.redirect(login);
    }
    userId = session.userId;
    platform = "web";
    next = sp.get("next") ?? "/mail";
  }

  const { url, cookie } = await startOAuth(c, userId, platform, next);
  const res = NextResponse.redirect(url);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
