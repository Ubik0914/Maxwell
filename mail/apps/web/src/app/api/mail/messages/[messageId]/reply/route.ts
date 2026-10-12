import { json, route } from "@/server/http";

/** 返信・全員に返信の宛先と引用を返す（下書き保存はしない） */
export const GET = route<{ messageId: string }>(async ({ c, session, req }, { messageId }) =>
  json(await c.core.mail.prepareReply(session, messageId, req.nextUrl.searchParams.get("mode") === "replyAll" ? "replyAll" : "reply")),
);
