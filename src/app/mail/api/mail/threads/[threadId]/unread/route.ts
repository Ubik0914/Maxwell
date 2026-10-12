import { json, route } from "@/mail/server/http";

export const POST = route<{ threadId: string }>(
  async ({ c, session }, { threadId }) => {
    await c.core.mail.setRead(session, threadId, false);
    return json({ ok: true });
  },
  { mutating: true },
);
