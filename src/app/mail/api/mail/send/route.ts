import { json, readJson, route } from "@/mail/server/http";

/** 送信。ユーザーが確認ダイアログで明示的に操作した場合のみ UI から呼ばれる */
export const POST = route(async ({ c, session, req }) => json(await c.core.mail.send(session, await readJson(req))), {
  mutating: true,
  rateLimit: "send",
});
