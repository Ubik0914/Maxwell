import { json, route } from "@/server/http";
import { SESSION_COOKIE } from "@/server/session";

/** ログアウト：セッション版を上げ、他端末のセッションも無効にする */
export const POST = route(
  async ({ c, session }) => {
    await c.repos.users.bumpSessionVersion(session.userId);
    const res = json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  },
  { mutating: true },
);
