import { json, route } from "@/mail/server/http";

export const POST = route<{ threadId: string }>(
  async ({ c, session }, { threadId }) => {
    await c.core.mail.archive(session, threadId);
    return json({ ok: true });
  },
  { mutating: true },
);
