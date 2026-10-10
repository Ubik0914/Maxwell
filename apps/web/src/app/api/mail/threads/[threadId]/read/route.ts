import { json, route } from "@/server/http";

export const POST = route<{ threadId: string }>(
  async ({ c, session }, { threadId }) => {
    await c.core.mail.setRead(session, threadId, true);
    return json({ ok: true });
  },
  { mutating: true },
);
