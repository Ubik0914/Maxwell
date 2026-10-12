import { MailError } from "@synedge/mail-core";
import { json, route } from "@/server/http";

export const DELETE = route<{ id: string }>(
  async ({ c, session }, { id }) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new MailError("INVALID_INPUT");
    if (!(await c.repos.mcpTokens.revoke(session.userId, id))) throw new MailError("NOT_FOUND");
    return json({ ok: true });
  },
  { mutating: true },
);
