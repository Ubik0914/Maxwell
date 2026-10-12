import { MailError } from "@synedge/mail-core";
import { randomToken, sha256Hex } from "@synedge/mail-core/server";
import { z } from "zod";
import { json, readJson, route } from "@/server/http";

export const GET = route(async ({ c, session }) => {
  const tokens = await c.repos.mcpTokens.list(session.userId);
  return json({
    tokens: tokens.map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.tokenPrefix,
      createdAt: t.createdAt.toISOString(),
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    })),
  });
});

/** MCP接続用トークンを発行する。平文は作成時に一度だけ返し、DBにはハッシュのみ保存する */
export const POST = route(
  async ({ c, session, req }) => {
    const r = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(await readJson(req));
    if (!r.success) throw new MailError("INVALID_INPUT", "名前を1〜60文字で入力してください");
    if ((await c.repos.mcpTokens.list(session.userId)).length >= 10) {
      throw new MailError("INVALID_INPUT", "トークンは10個までです。不要なものを削除してください。");
    }
    const token = `syn_${randomToken(32)}`;
    const record = await c.repos.mcpTokens.create(session.userId, r.data.name, sha256Hex(token), token.slice(0, 8));
    return json({ id: record.id, name: record.name, token }, { status: 201 });
  },
  { mutating: true, rateLimit: "auth" },
);
