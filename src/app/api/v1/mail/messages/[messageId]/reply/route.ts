import { readJson } from "@/mail/server/http";
import { replyForAgent, replyInput } from "@/mail/server/agent";
import { parseInput, v1Route } from "@/mail/server/v1";

/** POST /api/v1/mail/messages/:id/reply { mode, body? } — 返信の宛先・件名・引用を返す。Gmail には保存しない */
export const POST = v1Route<{ messageId: string }>(async ({ req, c, session }, { messageId }) => {
  const body = (await readJson(req, 128 * 1024)) as Record<string, unknown>;
  return replyForAgent({ mail: c.core.mail, userId: session.userId }, parseInput(replyInput, { ...body, message_id: messageId }));
});
