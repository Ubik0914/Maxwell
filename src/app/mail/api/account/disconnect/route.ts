import { disconnectAccount } from "@/mail/server/auth-flow";
import { json, route } from "@/mail/server/http";

/** 接続解除：トークン取り消し・保存データ削除。Gmail のメールは削除しない。Maxwell のログインはそのまま */
export const POST = route(
  async ({ c, session }) => {
    const r = await disconnectAccount(c, session.userId);
    return json({ ok: true, revoked: r.revoked });
  },
  { mutating: true, rateLimit: "auth" },
);
