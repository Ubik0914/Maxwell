import { webUrl } from "@/mail/core";
import { createConnectTicket } from "@/mail/server/auth-flow";
import { json, readJson, route } from "@/mail/server/http";

/** Android アプリ（WebView、ログイン済み）が外部ブラウザで Gmail 接続を始めるための URL を返す */
export const POST = route(
  async ({ req, c, session }) => {
    const body = (await readJson(req, 2048)) as { next?: unknown };
    const ticket = await createConnectTicket(c, session.userId, typeof body.next === "string" ? body.next : "/mail");
    const url = webUrl("/api/auth/google/start", c.env.APP_ORIGIN);
    url.searchParams.set("ticket", ticket);
    return json({ url: url.toString() });
  },
  { mutating: true, rateLimit: "auth" },
);
