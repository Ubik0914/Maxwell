import { disconnectAccount } from "@/server/auth-flow";
import { json, route } from "@/server/http";
import { SESSION_COOKIE } from "@/server/session";

/** 接続解除：トークン取り消し・保存データ削除。Gmail のメールは削除しない */
export const POST = route(
  async ({ c, session }) => {
    const r = await disconnectAccount(c, session.userId);
    const res = json({ ok: true, revoked: r.revoked });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  },
  { mutating: true, rateLimit: "auth" },
);
